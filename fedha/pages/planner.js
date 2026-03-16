import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { getSetting, setSetting } from '../lib/db';
import { todayISO } from '../lib/utils';
import { format } from 'date-fns';

const DEFAULT_BLOCKS = [
  { id: 'wake',         time: '06:00', label: 'Wake Up — No Phone',    type: 'routine',  duration: 20,  emoji: '⏰', note: 'First 20 mins phone-free. Drink water, stretch, wash face.' },
  { id: 'bfast_prep',   time: '06:20', label: 'Prepare Breakfast',      type: 'meal',     duration: 20,  emoji: '🍳', note: 'Start cooking now — ready by 6:40. Check Meals tab for today.' },
  { id: 'breakfast',    time: '06:40', label: 'Eat Breakfast',           type: 'meal',     duration: 20,  emoji: '🍽️', note: 'Sit down and eat properly. No phone while eating.' },
  { id: 'dishes1',      time: '07:00', label: 'Clean Dishes',            type: 'routine',  duration: 10,  emoji: '🧹', note: 'Clean as you go — 10 mins now saves stress later.' },
  { id: 'study1',       time: '07:10', label: 'Deep Study Block',        type: 'study',    duration: 90,  emoji: '📚', note: 'Phone in another room. Hardest subject first — brain is sharpest now.' },
  { id: 'walk',         time: '08:40', label: 'Walk to School',          type: 'routine',  duration: 10,  emoji: '🚶', note: 'Leave now — 10 min walk, arrive 8:50. Early is on time.' },
  { id: 'school1',      time: '08:50', label: 'School / Class',          type: 'school',   duration: 130, emoji: '🏫', note: 'Be present. Take notes by hand. Ask questions.' },
  { id: 'snack',        time: '10:50', label: '10am Snack',              type: 'meal',     duration: 15,  emoji: '🍌', note: 'Banana + groundnuts. Drink water.' },
  { id: 'school2',      time: '11:05', label: 'School / Class',          type: 'school',   duration: 115, emoji: '🏫', note: 'Stay focused. The afternoon is for your own work.' },
  { id: 'lunch_prep',   time: '13:00', label: 'Prepare Lunch',           type: 'meal',     duration: 25,  emoji: '🍲', note: 'Start cooking. Check Meals tab for today\'s lunch.' },
  { id: 'lunch',        time: '13:25', label: 'Eat Lunch',               type: 'meal',     duration: 25,  emoji: '🍽️', note: 'Biggest meal of the day. Large portion — fuel for the afternoon.' },
  { id: 'dishes2',      time: '13:50', label: 'Clean Up',                type: 'routine',  duration: 10,  emoji: '🧹', note: 'Quick clean. Clear space = clear mind.' },
  { id: 'study2',       time: '14:00', label: 'Study / Revision',        type: 'study',    duration: 90,  emoji: '📚', note: 'Review morning notes. Assignments. No music with lyrics.' },
  { id: 'coding',       time: '15:30', label: 'Coding Block',            type: 'coding',   duration: 90,  emoji: '💻', note: 'Build something real. Work on Fedha or a side project. Practice > tutorials.' },
  { id: 'bae',          time: '17:00', label: 'Bae Time 💕',             type: 'personal', duration: 90,  emoji: '💕', note: 'Protected time. Phone down. Be fully present with her.' },
  { id: 'dinner_prep',  time: '18:30', label: 'Prepare Dinner',          type: 'meal',     duration: 20,  emoji: '🍲', note: 'Start cooking. Check Meals tab for tonight.' },
  { id: 'dinner',       time: '18:50', label: 'Eat Dinner',              type: 'meal',     duration: 25,  emoji: '🍽️', note: 'Relax and eat well. Fuels your overnight muscle recovery.' },
  { id: 'dishes3',      time: '19:15', label: 'Clean Kitchen',           type: 'routine',  duration: 10,  emoji: '🧹', note: 'Full clean. Clear kitchen = better morning.' },
  { id: 'freetime',     time: '19:25', label: 'Free Time',               type: 'personal', duration: 60,  emoji: '🎧', note: 'Earned free time. TikTok, music, relax — but ONLY NOW, not at 6am.' },
  { id: 'review',       time: '20:25', label: 'Daily Review',            type: 'routine',  duration: 20,  emoji: '📝', note: 'What did you learn? What to do differently? Write 3 lines.' },
  { id: 'night_prep',   time: '20:45', label: 'Night Prep',              type: 'routine',  duration: 15,  emoji: '🌙', note: 'Set clothes, pack bag, set alarm. Drink milk before bed.' },
  { id: 'sleep',        time: '21:00', label: 'Sleep',                   type: 'sleep',    duration: 540, emoji: '😴', note: 'Phone charging in another room. 9 hours = max muscle growth + memory.' },
];

const TYPE_COLORS = {
  routine:  { bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.35)',  text: '#818CF8', dot: '#6366F1' },
  meal:     { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)',  text: '#FCD34D', dot: '#F59E0B' },
  study:    { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)',  text: '#93C5FD', dot: '#3B82F6' },
  school:   { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.35)',  text: '#C4B5FD', dot: '#8B5CF6' },
  coding:   { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)',  text: '#6EE7B7', dot: '#10B981' },
  personal: { bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.35)',  text: '#F9A8D4', dot: '#EC4899' },
  sleep:    { bg: 'rgba(30,41,59,0.5)',    border: 'rgba(51,65,85,0.5)',     text: '#475569', dot: '#334155' },
};

const TYPE_LABELS = { routine:'Routine', meal:'Meal', study:'Study', school:'School', coding:'Coding', personal:'Personal', sleep:'Sleep' };

function t2m(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }
function m2t(m) { return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
function fmt12(t) { const [h,m] = t.split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; }

async function requestNotif() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

function fireNotif(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', requireInteraction: true, vibrate: [200,100,200] }); } catch(e) {}
}

function scheduleAll(blocks) {
  const now = new Date();
  const nowMs = now.getTime();
  blocks.forEach(b => {
    const bMins = t2m(b.time);
    const startMs = new Date().setHours(Math.floor(bMins/60), bMins%60, 0, 0);
    const diff = startMs - nowMs;

    const titles = { meal:'🍽️ MEAL TIME', study:'📚 STUDY TIME', coding:'💻 CODE TIME', school:'🏫 SCHOOL TIME', routine:'⏰ ROUTINE', personal:b.label.includes('Bae')?'💕 BAE TIME':'🎧 FREE TIME', sleep:'😴 SLEEP TIME' };
    const title = titles[b.type] || '⏰ Fedha Planner';

    if (diff > 0 && diff < 86400000) {
      setTimeout(() => fireNotif(title, `${b.emoji} ${b.label} — ${b.note}`), diff);
    }

    // Prep reminders
    if (b.type === 'meal' && b.label.includes('Eat')) {
      const prepDiff = startMs - 25*60*1000 - nowMs;
      if (prepDiff > 0) setTimeout(() => fireNotif('🍳 START COOKING NOW', `Start preparing ${b.label.replace('Eat ','')} now — ready by ${fmt12(b.time)}`), prepDiff);
    }
    if (b.type === 'school') {
      const walkDiff = startMs - 12*60*1000 - nowMs;
      if (walkDiff > 0) setTimeout(() => fireNotif('🚶 LEAVE NOW FOR SCHOOL', `Start your 10-min walk to arrive by ${fmt12(b.time)}`), walkDiff);
    }
    if (b.type === 'study' || b.type === 'coding') {
      const warnDiff = startMs - 5*60*1000 - nowMs;
      if (warnDiff > 0) setTimeout(() => fireNotif(`⚠️ ${b.label} in 5 mins`, `Put your phone down. ${b.note}`), warnDiff);
    }
    if (b.type === 'sleep') {
      const warnDiff = startMs - 30*60*1000 - nowMs;
      if (warnDiff > 0) setTimeout(() => fireNotif('🌙 Wind Down in 30 mins', 'Start wrapping up. Put the phone down. Prepare for bed.'), warnDiff);
    }
  });
}

function EditModal({ block, onSave, onClose }) {
  const [s, setS] = useState({ ...block });
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width:36, height:4, background:'var(--border)', borderRadius:2, margin:'12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize:16, fontWeight:700 }}>Edit Block</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {[
            { label:'Start Time', key:'time', type:'time' },
            { label:'Label', key:'label', type:'text' },
            { label:'Duration (minutes)', key:'duration', type:'number' },
            { label:'Reminder Note', key:'note', type:'text' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize:12, color:'var(--text-3)', fontWeight:600, letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:8 }}>{f.label}</label>
              <input className="input" type={f.type} value={s[f.key]} onChange={e => setS(p => ({ ...p, [f.key]: f.type==='number' ? Number(e.target.value) : e.target.value }))} />
            </div>
          ))}
          <div>
            <label style={{ fontSize:12, color:'var(--text-3)', fontWeight:600, letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:8 }}>Type</label>
            <select className="input" value={s.type} onChange={e => setS(p => ({ ...p, type: e.target.value }))}>
              {Object.entries(TYPE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={() => onSave(s)}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

export default function PlannerPage() {
  const [blocks, setBlocks] = useState(DEFAULT_BLOCKS);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifPerm, setNotifPerm] = useState('default');
  const [completedIds, setCompletedIds] = useState([]);
  const [now, setNow] = useState(new Date());
  const [tab, setTab] = useState('today');
  const [editBlock, setEditBlock] = useState(null);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    async function load() {
      const saved = await getSetting('planner_blocks', null);
      if (saved) setBlocks(saved);
      const done = await getSetting(`planner_done_${todayISO()}`, []);
      if (done) setCompletedIds(done);
      const ne = await getSetting('planner_notifs', false);
      setNotifEnabled(ne);
      if ('Notification' in window) setNotifPerm(Notification.permission);
    }
    load();
  }, []);

  async function saveBlocks(nb) {
    const sorted = [...nb].sort((a,b) => t2m(a.time) - t2m(b.time));
    setBlocks(sorted);
    await setSetting('planner_blocks', sorted);
  }

  async function toggleDone(id) {
    const updated = completedIds.includes(id) ? completedIds.filter(x => x !== id) : [...completedIds, id];
    setCompletedIds(updated);
    await setSetting(`planner_done_${todayISO()}`, updated);
  }

  async function enableNotifs() {
    const ok = await requestNotif();
    setNotifPerm(ok ? 'granted' : 'denied');
    if (ok) {
      setNotifEnabled(true);
      await setSetting('planner_notifs', true);
      scheduleAll(blocks);
      fireNotif('🟢 Fedha Planner Active', 'Reminders are on. You will be notified for every block, meals, school walk and sleep.');
    }
  }

  async function handleEditSave(updated) {
    await saveBlocks(blocks.map(b => b.id === updated.id ? updated : b));
    setEditBlock(null);
    if (notifEnabled) scheduleAll(blocks);
  }

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const currentBlock = blocks.find(b => nowMins >= t2m(b.time) && nowMins < t2m(b.time) + b.duration);
  const currentProgress = currentBlock ? ((nowMins - t2m(currentBlock.time)) / currentBlock.duration) * 100 : 0;
  const nextBlock = blocks.find(b => t2m(b.time) > nowMins);
  const totalNonSleep = blocks.filter(b => b.type !== 'sleep').length;
  const pct = Math.round((completedIds.length / totalNonSleep) * 100);

  const stats = {
    study: blocks.filter(b => b.type === 'study').reduce((s,b) => s+b.duration, 0),
    coding: blocks.filter(b => b.type === 'coding').reduce((s,b) => s+b.duration, 0),
    bae: blocks.filter(b => b.type === 'personal' && b.label.toLowerCase().includes('bae')).reduce((s,b) => s+b.duration, 0),
    meals: blocks.filter(b => b.type === 'meal' && b.label.includes('Eat')).length,
  };

  return (
    <Layout fab={false}>
      <div className="page">
        <div className="page-header">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
            <h1 style={{ fontSize:22, fontWeight:700 }}>Daily Planner</h1>
            <span className="font-num" style={{ fontSize:13, color:'var(--text-3)' }}>{format(now,'h:mm a')}</span>
          </div>
          <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:16 }}>{format(now,'EEEE, d MMMM yyyy')}</div>

          {/* Notif banner */}
          {!notifEnabled && notifPerm !== 'denied' && (
            <button onClick={enableNotifs} style={{ width:'100%', padding:'12px 16px', background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:12, display:'flex', alignItems:'center', gap:12, cursor:'pointer', marginBottom:14, textAlign:'left' }}>
              <span style={{ fontSize:22 }}>🔔</span>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--green)', fontFamily:'Outfit' }}>Turn On Reminders</div>
                <div style={{ fontSize:12, color:'var(--text-3)' }}>Get notified for meals (with cook warnings), school walk, study, coding & sleep</div>
              </div>
            </button>
          )}
          {notifPerm === 'denied' && !notifEnabled && (
            <div style={{ padding:'10px 14px', background:'var(--red-dim)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, fontSize:13, color:'var(--red)', marginBottom:14 }}>
              🔕 Notifications blocked — go to phone Settings → Chrome → Notifications → Allow for this site
            </div>
          )}
          {notifEnabled && (
            <div style={{ padding:'10px 14px', background:'var(--green-dim)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:10, fontSize:13, color:'var(--green)', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              🔔 Reminders active — you will be alerted for every block today
            </div>
          )}

          <div style={{ display:'flex', gap:8 }}>
            {[['today','📅 Today'],['stats','📊 Stats'],['edit','⚙️ Edit']].map(([v,l]) => (
              <button key={v} className={`chip ${tab===v?'active':''}`} onClick={() => setTab(v)}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ padding:'0 20px' }}>

          {/* TODAY */}
          {tab === 'today' && (
            <>
              {/* Current block hero */}
              {currentBlock && (
                <div style={{ marginBottom:16 }}>
                  <div className="section-title">RIGHT NOW</div>
                  <div style={{ background:TYPE_COLORS[currentBlock.type].bg, border:`2px solid ${TYPE_COLORS[currentBlock.type].border}`, borderRadius:16, padding:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                      <span style={{ fontSize:28 }}>{currentBlock.emoji}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:16, fontWeight:700, color:TYPE_COLORS[currentBlock.type].text }}>{currentBlock.label}</div>
                        <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>
                          Until {fmt12(m2t(t2m(currentBlock.time)+currentBlock.duration))} · {currentBlock.duration - Math.floor(nowMins - t2m(currentBlock.time))} min left
                        </div>
                      </div>
                    </div>
                    <div className="progress-bar" style={{ height:8, marginBottom:10 }}>
                      <div className="progress-fill" style={{ width:`${currentProgress}%`, background:TYPE_COLORS[currentBlock.type].dot }} />
                    </div>
                    <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.5 }}>{currentBlock.note}</div>
                  </div>
                </div>
              )}

              {/* Next block */}
              {nextBlock && (
                <div style={{ marginBottom:16 }}>
                  <div className="section-title">UP NEXT</div>
                  <div className="card" style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:22 }}>{nextBlock.emoji}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{nextBlock.label}</div>
                      <div style={{ fontSize:12, color:'var(--text-3)' }}>Starts at {fmt12(nextBlock.time)} · in {t2m(nextBlock.time)-nowMins} min</div>
                    </div>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:TYPE_COLORS[nextBlock.type].dot, flexShrink:0 }} />
                  </div>
                </div>
              )}

              {/* Progress */}
              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div className="section-title" style={{ marginBottom:0 }}>TODAY'S PROGRESS</div>
                  <div style={{ fontSize:13, color:'var(--green)', fontWeight:600 }}>{completedIds.length}/{totalNonSleep} done · {pct}%</div>
                </div>
                <div className="progress-bar" style={{ height:8 }}>
                  <div className="progress-fill" style={{ width:`${pct}%`, background:'var(--green)' }} />
                </div>
              </div>

              {/* Full schedule timeline */}
              <div className="section-title">FULL SCHEDULE</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:24 }}>
                {blocks.map((block) => {
                  const bStart = t2m(block.time);
                  const bEnd = bStart + block.duration;
                  const isNow = nowMins >= bStart && nowMins < bEnd;
                  const isPast = nowMins >= bEnd;
                  const isDone = completedIds.includes(block.id);
                  const c = TYPE_COLORS[block.type];
                  return (
                    <div key={block.id} style={{ display:'flex', alignItems:'flex-start', gap:8, opacity: isPast && !isDone ? 0.45 : 1 }}>
                      <div style={{ width:56, flexShrink:0, paddingTop:11, textAlign:'right' }}>
                        <div className="font-num" style={{ fontSize:11, color: isNow ? c.text : 'var(--text-3)', fontWeight: isNow ? 700 : 400, lineHeight:1.3 }}>
                          {fmt12(block.time).replace(' ','\n')}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:11 }}>
                        <div style={{ width:12, height:12, borderRadius:'50%', background: isNow ? c.dot : isDone ? 'var(--green)' : 'var(--border)', flexShrink:0, boxShadow: isNow ? `0 0 10px ${c.dot}70` : 'none' }} />
                        <div style={{ width:2, flex:1, background:'var(--border)', minHeight:16, marginTop:4 }} />
                      </div>
                      <div style={{ flex:1, background: isNow ? c.bg : isDone ? 'rgba(16,185,129,0.06)' : 'var(--card)', border:`1px solid ${isNow ? c.border : isDone ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`, borderRadius:10, padding:'10px 12px', marginBottom:2, cursor:'pointer' }}
                        onClick={() => toggleDone(block.id)}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:16, flexShrink:0 }}>{isDone ? '✅' : block.emoji}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, color: isNow ? c.text : isDone ? 'var(--text-3)' : 'var(--text)', textDecoration: isDone ? 'line-through' : 'none' }}>
                              {block.label}
                            </div>
                            <div style={{ fontSize:11, color:'var(--text-3)', marginTop:1 }}>
                              {block.duration < 60 ? `${block.duration} min` : `${Math.floor(block.duration/60)}h${block.duration%60>0?' '+block.duration%60+'m':''}`}
                            </div>
                          </div>
                          <div style={{ width:6, height:6, borderRadius:'50%', background:c.dot, flexShrink:0 }} />
                        </div>
                        {isNow && <div style={{ fontSize:12, color:'var(--text-2)', marginTop:6, lineHeight:1.5, borderTop:'1px solid var(--border)', paddingTop:6 }}>{block.note}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding:'10px 14px', background:'var(--card-2)', borderRadius:10, fontSize:12, color:'var(--text-3)', marginBottom:24 }}>
                💡 Tap any block to mark it done. Resets every day automatically.
              </div>
            </>
          )}

          {/* STATS */}
          {tab === 'stats' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:24 }}>
              {[
                { label:'Study Time', value:`${Math.floor(stats.study/60)}h ${stats.study%60}m`, color:'#3B82F6', emoji:'📚', desc:'Focused study, no distractions' },
                { label:'Coding Time', value:`${Math.floor(stats.coding/60)}h ${stats.coding%60}m`, color:'#10B981', emoji:'💻', desc:'Building real projects' },
                { label:'Meals', value:`${stats.meals} meals`, color:'#F59E0B', emoji:'🍽️', desc:'Breakfast, snack, lunch, dinner' },
                { label:'Bae Time', value:`${Math.floor(stats.bae/60)}h ${stats.bae%60}m`, color:'#EC4899', emoji:'💕', desc:'Protected — no multitasking' },
                { label:'Free Time', value:'1 hour', color:'#94A3B8', emoji:'🎧', desc:'Earned — after everything is done' },
                { label:'Sleep', value:'9 hours', color:'#6366F1', emoji:'😴', desc:'Non-negotiable for muscle + brain' },
              ].map(s => (
                <div key={s.label} className="card" style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:`${s.color}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{s.emoji}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600 }}>{s.label}</div>
                    <div style={{ fontSize:12, color:'var(--text-3)' }}>{s.desc}</div>
                  </div>
                  <div className="font-num" style={{ fontSize:15, fontWeight:700, color:s.color }}>{s.value}</div>
                </div>
              ))}
              <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, padding:'14px 16px' }}>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--red)', marginBottom:8 }}>⚠️ The Scroll Problem</div>
                <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>
                  TikTok and Instagram steal your peak brain hours. Your schedule gives you 1 hour of free time at 7:25 PM — that is when you scroll, not at 6 AM.
                  Morning is your most valuable time. Protect it like money.
                </div>
              </div>
            </div>
          )}

          {/* EDIT */}
          {tab === 'edit' && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:16, lineHeight:1.5 }}>
                Tap any block to adjust the time, duration or reminder note.
              </div>
              {blocks.map(block => {
                const c = TYPE_COLORS[block.type];
                return (
                  <div key={block.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, marginBottom:8, cursor:'pointer' }}
                    onClick={() => setEditBlock(block)}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:c.dot, flexShrink:0 }} />
                    <span className="font-num" style={{ fontSize:11, color:'var(--text-3)', width:54, flexShrink:0 }}>{fmt12(block.time)}</span>
                    <div style={{ flex:1, fontSize:13, fontWeight:500 }}>{block.emoji} {block.label}</div>
                    <span style={{ fontSize:11, color:'var(--text-3)' }}>{block.duration}m ✏️</span>
                  </div>
                );
              })}
              <button className="btn-ghost" style={{ marginTop:12 }} onClick={() => saveBlocks(DEFAULT_BLOCKS)}>
                Reset to Default Schedule
              </button>
            </div>
          )}
        </div>
      </div>
      {editBlock && <EditModal block={editBlock} onSave={handleEditSave} onClose={() => setEditBlock(null)} />}
    </Layout>
  );
}
