import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { buildJarvisContext } from '../lib/jarvis-context';
import { executeProposedAction, describeProposedAction } from '../lib/jarvis-actions';
import { getJarvisMemory, setJarvisMemory, getJarvisHistory, appendJarvisMessage, saveFoodLog } from '../lib/db';
import { genId } from '../lib/utils';

// Web Speech API is browser-native and free — no extra API cost for voice.
// Support is real but inconsistent (best on Chrome/Edge; Safari and
// Firefox support varies), so every voice control is additive: text chat
// always works regardless of what the browser supports.
function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}
function speechSynthesisAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export default function JarvisWidget() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { role, content }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(false);
  const [pendingActions, setPendingActions] = useState([]); // proposed actions awaiting confirmation
  const [actionError, setActionError] = useState(null);
  const recognitionRef = useRef(null);
  const scrollRef = useRef(null);

  // Load recent history once when first opened, so re-opening the widget
  // mid-session (or after a reload) picks up where the conversation left
  // off rather than starting blank every time.
  useEffect(() => {
    if (!open || messages.length) return;
    (async () => {
      const history = await getJarvisHistory();
      setMessages(history.map((h) => ({ role: h.role, content: h.content })));
    })();
  }, [open, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pendingActions]);

  const speak = useCallback((text) => {
    if (!voiceReplyEnabled || !speechSynthesisAvailable()) return;
    try {
      window.speechSynthesis.cancel(); // don't stack replies if one's still talking
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.02;
      window.speechSynthesis.speak(utter);
    } catch {}
  }, [voiceReplyEnabled]);

  async function send(rawText) {
    const text = (rawText ?? input).trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setActionError(null);

    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    appendJarvisMessage('user', text); // fire-and-forget persistence

    try {
      const [context, memory, history] = await Promise.all([
        buildJarvisContext(),
        getJarvisMemory(),
        getJarvisHistory(),
      ]);

      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context,
          memory,
          history: history.map((h) => ({ role: h.role, content: h.content })),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      appendJarvisMessage('assistant', data.reply);
      speak(data.reply);

      if (data.memoryUpdate) {
        await setJarvisMemory(data.memoryUpdate);
      }
      if (data.proposedActions?.length) {
        setPendingActions((prev) => [...prev, ...data.proposedActions.map((a) => ({ ...a, id: genId() }))]);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Something went wrong reaching Jarvis: ${e.message}` }]);
    } finally {
      setSending(false);
    }
  }

  async function confirmAction(action) {
    setActionError(null);
    try {
      await executeProposedAction(action, {
        addTransaction: app.addTransaction,
        removeTransaction: app.removeTransaction,
        updateLoan: app.updateLoan,
        updateIncomePlan: app.updateIncomePlan,
        saveFoodLog,
        genId,
        currency: app.currency,
      });
      setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
      setMessages((prev) => [...prev, { role: 'assistant', content: `Done — ${describeProposedAction(action).toLowerCase()}.` }]);
    } catch (e) {
      setActionError(`Couldn't do that: ${e.message}`);
    }
  }

  function rejectAction(actionId) {
    setPendingActions((prev) => prev.filter((a) => a.id !== actionId));
  }

  function startListening() {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) { setActionError("Voice input isn't supported in this browser — try typing instead."); return; }

    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) send(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Talk to Jarvis"
        style={{
          position: 'fixed', bottom: 84, left: 20, width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', border: 'none', cursor: 'pointer',
          display: open ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(99,102,241,0.5)', zIndex: 998, fontSize: 24,
        }}
      >
        🤖
      </button>

      {open && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          style={{ zIndex: 1000 }}
        >
          <div className="modal-sheet" style={{ height: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto 0' }} />
            <div className="modal-header">
              <span style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                🤖 Jarvis
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn-icon"
                  onClick={() => setVoiceReplyEnabled((v) => !v)}
                  aria-label={voiceReplyEnabled ? 'Mute voice replies' : 'Enable voice replies'}
                  title={voiceReplyEnabled ? 'Voice replies on' : 'Voice replies off'}
                  style={{ opacity: voiceReplyEnabled ? 1 : 0.5 }}
                >
                  {voiceReplyEnabled ? '🔊' : '🔇'}
                </button>
                <button className="btn-icon" onClick={() => setOpen(false)} aria-label="Close">✕</button>
              </div>
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!messages.length && (
                <div style={{ marginTop: 40 }}>
                  <div style={{ color: 'var(--text-2)', fontSize: 14, textAlign: 'center', marginBottom: 16 }}>
                    Hey — I'm Jarvis. Ask me about your money, your plan for today, or just talk.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                    {[
                      'How am I doing financially this week?',
                      'Draft my CV from my projects and certificates',
                      "What's on my plan today?",
                      'Suggest a feature for one of my projects',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => send(suggestion)}
                        style={{
                          padding: '8px 14px', borderRadius: 16, background: 'var(--card-2)',
                          border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13,
                          cursor: 'pointer', fontFamily: 'Outfit',
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    background: m.role === 'user' ? 'var(--green-dim)' : 'var(--card-2)',
                    border: `1px solid ${m.role === 'user' ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                    borderRadius: 14,
                    padding: '10px 14px',
                    fontSize: 14,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                </div>
              ))}

              {pendingActions.map((action) => (
                <div
                  key={action.id}
                  style={{
                    alignSelf: 'flex-start', maxWidth: '90%', background: 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.35)', borderRadius: 14, padding: '12px 14px',
                  }}
                >
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>Jarvis wants to:</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{describeProposedAction(action)}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => confirmAction(action)}
                      style={{ flex: 1, padding: '8px', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: 'var(--green)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit', fontWeight: 600 }}
                    >
                      ✓ Confirm
                    </button>
                    <button
                      onClick={() => rejectAction(action.id)}
                      style={{ flex: 1, padding: '8px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit', fontWeight: 600 }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}

              {actionError && (
                <div style={{ alignSelf: 'flex-start', fontSize: 13, color: '#EF4444' }}>{actionError}</div>
              )}
              {sending && (
                <div style={{ alignSelf: 'flex-start', fontSize: 13, color: 'var(--text-2)' }}>Jarvis is thinking…</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '12px 16px 20px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={listening ? stopListening : startListening}
                aria-label={listening ? 'Stop listening' : 'Speak to Jarvis'}
                style={{
                  width: 44, height: 44, borderRadius: '50%', border: 'none', flexShrink: 0,
                  background: listening ? '#EF4444' : 'var(--card-2)', color: listening ? '#fff' : 'var(--text-2)',
                  fontSize: 18, cursor: 'pointer',
                }}
              >
                {listening ? '⏹' : '🎤'}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Talk to Jarvis…"
                style={{
                  flex: 1, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 22,
                  padding: '0 16px', color: 'var(--text)', fontSize: 14, fontFamily: 'Outfit',
                }}
              />
              <button
                onClick={() => send()}
                disabled={sending || !input.trim()}
                aria-label="Send"
                style={{
                  width: 44, height: 44, borderRadius: '50%', border: 'none', flexShrink: 0,
                  background: 'var(--green)', color: '#000', fontSize: 18, cursor: 'pointer',
                  opacity: sending || !input.trim() ? 0.5 : 1,
                }}
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
