// Luxe's voice: one calm, warm voice for Jarvis, DJ Luxe, the pitch trainer and the workout coach, like a
// private-banking concierge rather than a robot. It uses the best voice the phone already has (no data, no cost):
// natural / neural / "network" voices first, women's British or American English preferred, spoken a touch slower.
// You can pick a different one (getVoiceChoices / setVoiceName); the choice is kept in localStorage 'luxe_voice'.

const KEY = 'luxe_voice';
const isBrowser = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// Higher = sounds more human. Names seen on Android Chrome, iPhone, Windows and Mac.
function score(v) {
  const n = `${v.name} ${v.voiceURI || ''}`.toLowerCase();
  const lang = (v.lang || '').toLowerCase().replace('_', '-');
  if (!lang.startsWith('en')) return -1;
  let s = 0;
  if (/natural|neural|premium|enhanced|wavenet|studio|journey/.test(n)) s += 60;
  if (/network/.test(n)) s += 45;                       // Google's online voices on Android
  if (!v.localService) s += 10;
  if (/en-gb/.test(lang)) s += 14; else if (/en-us/.test(lang)) s += 10; else if (/en-(au|ie|za|ke)/.test(lang)) s += 6;
  if (/female|woman|samantha|serena|sonia|libby|ava|aria|jenny|emma|michelle|karen|moira|tessa|kate|stephanie|martha|fiona|victoria|allison|susan|zira|hazel|google uk english female/.test(n)) s += 22;
  if (/en-gb-x-gba|en-gb-x-gbc|en-gb-x-gbg|en-us-x-sfg|en-us-x-tpc|en-us-x-iol/.test(n)) s += 20; // Android female voice ids
  if (/\bmale\b|daniel|david|george|guy|ryan|thomas|fred|alex\b|rishi|en-gb-x-gbb|en-gb-x-gbd|en-us-x-iom|en-us-x-tpd/.test(n)) s -= 25;
  if (/compact|espeak|robot|whisper|bad news|bells|zarvox|trinoids|novelty/.test(n)) s -= 80;
  return s;
}

let cache = null;
function voices() {
  if (!isBrowser()) return [];
  const list = window.speechSynthesis.getVoices() || [];
  if (list.length) cache = list;
  return cache || list;
}
if (isBrowser()) { try { window.speechSynthesis.onvoiceschanged = () => { cache = null; voices(); }; } catch { /* old browser */ } }

export function getVoiceChoices() {
  return voices().filter((v) => score(v) >= 0).sort((a, b) => score(b) - score(a)).slice(0, 12)
    .map((v) => ({ name: v.name, lang: v.lang, natural: score(v) >= 45 }));
}
export function getVoiceName() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
export function setVoiceName(name) { try { if (name) localStorage.setItem(KEY, name); else localStorage.removeItem(KEY); } catch { /* private mode */ } }

export function pickVoice() {
  const all = voices();
  const chosen = getVoiceName();
  if (chosen) { const v = all.find((x) => x.name === chosen); if (v) return v; }
  return all.filter((v) => score(v) >= 0).sort((a, b) => score(b) - score(a))[0] || null;
}

// Styles: 'concierge' (default, calm), 'host' (radio DJ, a little brighter), 'coach' (workouts, quicker).
const STYLE = { concierge: { rate: 0.94, pitch: 1.0 }, host: { rate: 0.98, pitch: 1.02 }, coach: { rate: 1.05, pitch: 1.0 } };

// Speaks text in the Luxe voice. Returns the utterance (or null). Cancels anything already speaking unless queue.
export function speak(text, { style = 'concierge', onEnd, onStart, queue = false, rate, pitch, volume = 1 } = {}) {
  if (!text || !isBrowser()) { onEnd?.(); return null; }
  try {
    const u = new SpeechSynthesisUtterance(String(text).replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim());
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
    const st = STYLE[style] || STYLE.concierge;
    u.rate = rate ?? st.rate; u.pitch = pitch ?? st.pitch; u.volume = volume;
    if (onEnd) { u.onend = () => onEnd(); u.onerror = () => onEnd(); }
    if (onStart) u.onstart = onStart;
    if (!queue) window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return u;
  } catch { onEnd?.(); return null; }
}

export function stopSpeaking() { try { if (isBrowser()) window.speechSynthesis.cancel(); } catch { /* none */ } }
