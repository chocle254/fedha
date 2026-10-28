import { useEffect, useState } from 'react';
import { coachTasks, hoursLeft, fmtHours, mentorNotice } from '../../lib/hack-coach';
import { todayISO } from '../../lib/utils';

// Team on Telegram: the mentor posts the plan, a check-in or the pitch cues to a linked Telegram group.
// Link a group: add the Luxe bot to it and send /link in the group (only your own /link counts).
// Every message is shown in an editable preview first; nothing is sent until you press Send.
export function planText(hack) {
  const tasks = coachTasks(hack);
  const left = hoursLeft(hack);
  const L = [`🛠️ ${hack.name || 'Hackathon'}: build plan`];
  if (hack.coach?.idea) L.push(`🎯 ${hack.coach.idea.title}: ${hack.coach.idea.pitch}`);
  if (left != null) L.push(`⏳ ${fmtHours(left)}`);
  L.push('');
  tasks.forEach((t, i) => L.push(`${t.done ? '✅' : '⬜'} ${i + 1}. ${t.text}${t.due ? ` (${t.due})` : ''}${t.minutes ? ` · ${Math.round(t.minutes)}m` : ''}`));
  if (!tasks.length) L.push('No plan yet.');
  return L.join('\n');
}

export function checkinText(hack) {
  const tasks = coachTasks(hack);
  const today = todayISO();
  const done = tasks.filter((t) => t.done);
  const late = tasks.filter((t) => !t.done && t.due && t.due < today);
  const next = tasks.filter((t) => !t.done).slice(0, 3);
  const left = hoursLeft(hack);
  const n = mentorNotice(hack);
  const L = [`📣 ${hack.name || 'Hackathon'}: check-in ${today}`];
  if (left != null) L.push(`⏳ ${fmtHours(left)}`);
  L.push(`✅ Done: ${done.length}/${tasks.length}`);
  if (late.length) L.push(`⚠️ Behind: ${late.map((t) => t.text).join('; ')}`);
  if (next.length) { L.push('', '👉 Next up:'); next.forEach((t) => L.push(`• ${t.text}`)); }
  if (n?.text) L.push('', `🧭 Mentor: ${n.text}`);
  return L.join('\n');
}

function pitchText(hack) {
  const k = hack.coach?.pitch;
  if (!k) return '';
  return [`🎤 ${hack.name || 'Hackathon'}: pitch order (${Math.round(k.seconds / 60)} min)`, `Opener: “${k.opener}”`, '', ...k.cues.map((c, i) => `${i + 1}. ${c.title} (${c.seconds}s): ${c.say}${c.show ? `\n   Screen: ${c.show}` : ''}`), '', `Close: “${k.closer}”`].join('\n');
}

export default function TeamChannel({ hack }) {
  const [state, setState] = useState(null);
  const [chat, setChat] = useState('');
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => fetch('/api/team/telegram').then((r) => r.json()).then((j) => { setState(j); if (!chat && j.chats?.[0]) setChat(j.chats[0].id); }).catch(() => setState({ chats: [], error: true }));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setSending(true); setMsg('');
    try {
      const r = await fetch('/api/team/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: draft }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not send.');
      setMsg('Sent to the team ✓'); setDraft('');
    } catch (e) { setMsg(e.message); } finally { setSending(false); }
  };

  const chats = state?.chats || [];
  return (
    <section className="card muse-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="muse-label">📣 TEAM ON TELEGRAM</div>
        {chats.length > 0 && <button type="button" className="muse-link" onClick={load}>↻</button>}
      </div>
      {!state && <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 6 }}>Loading…</div>}
      {state && !state.configured && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 6 }}>The Telegram bot is not set up on the server (TELEGRAM_BOT_TOKEN).</div>}
      {state?.configured && !chats.length && (
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.6 }}>
          Let the mentor talk to your team: add {state.bot ? `@${state.bot}` : 'your Luxe bot'} to the team&apos;s Telegram group, then send <b>/link</b> in that group. Tap ↻ here afterwards. <button type="button" className="muse-link" onClick={load}>↻ Check again</button>
        </div>
      )}
      {chats.length > 0 && (
        <>
          <select className="input" style={{ marginTop: 8 }} value={chat} onChange={(e) => setChat(e.target.value)}>
            {chats.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <div className="muse-suggest" style={{ marginTop: 8 }}>
            <button type="button" onClick={() => setDraft(planText(hack))}>🛠️ Plan</button>
            <button type="button" onClick={() => setDraft(checkinText(hack))}>📣 Check-in</button>
            {hack.coach?.pitch && <button type="button" onClick={() => setDraft(pitchText(hack))}>🎤 Pitch cues</button>}
            <button type="button" onClick={() => setDraft(`🧭 ${hack.name || 'Team'}: `)}>✍️ Message</button>
          </div>
          {draft && (
            <>
              <textarea className="input" rows={8} style={{ marginTop: 8, fontSize: 12.5 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button className="btn-primary" style={{ marginTop: 8 }} onClick={send} disabled={sending || !draft.trim()}>{sending ? 'Sending…' : `Send to ${chats.find((c) => c.id === chat)?.title || 'the group'}`}</button>
            </>
          )}
          {msg && <div style={{ fontSize: 12.5, marginTop: 6, color: msg.includes('✓') ? 'var(--green)' : '#EF4444' }}>{msg}</div>}
        </>
      )}
    </section>
  );
}
