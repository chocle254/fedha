import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { getSetting, setSetting } from '../lib/db';
import { todayISO } from '../lib/utils';
import { format } from 'date-fns';

const WEEKDAY_BLOCKS = [
  { id:'wake',        time:'06:00', label:'Wake Up — No Phone',   type:'routine',  duration:20,  emoji:'⏰', note:'First 20 mins phone-free. Drink water, stretch, wash face.' },
  { id:'bfast_prep',  time:'06:20', label:'Prepare Breakfast',    type:'meal',     duration:20,  emoji:'🍳', note:'Start cooking now. Check Meals tab for today\'s breakfast.' },
  { id:'breakfast',   time:'06:40', label:'Eat Breakfast',         type:'meal',     duration:20,  emoji:'🍽️', note:'Sit down and eat. No phone while eating.' },
  { id:'dishes1',     time:'07:00', label:'Clean Dishes',          type:'routine',  duration:10,  emoji:'🧹', note:'10 mins now saves stress later. Quick and clean.' },
  { id:'study1',      time:'07:10', label:'Deep Study Block',      type:'study',    duration:90,  emoji:'📚', note:'Phone in another room. Hardest subject first — brain is sharpest now.' },
  { id:'walk',        time:'08:40', label:'Walk to School',        type:'routine',  duration:10,  emoji:'🚶', note:'Leave now — 10 min walk, arrive 8:50. Early is on time.' },
  { id:'school1',     time:'08:50', label:'School / Class',        type:'school',   duration:130, emoji:'🏫', note:'Be present. Take notes. Ask questions when confused.' },
  { id:'snack',       time:'10:50', label:'10am Snack',            type:'meal',     duration:15,  emoji:'🍌', note:'Banana + groundnuts. Drink water. Eat quickly then back to focus.' },
  { id:'school2',     time:'11:05', label:'School / Class',        type:'school',   duration:115, emoji:'🏫', note:'Stay present. Afternoon is for your own work.' },
  { id:'lunch_prep',  time:'13:00', label:'Prepare Lunch',         type:'meal',     duration:25,  emoji:'🍲', note:'Start cooking now — food ready by 1:25. Check Meals tab.' },
  { id:'lunch',       time:'13:25', label:'Eat Lunch',             type:'meal',     duration:25,  emoji:'🍽️', note:'Biggest meal of the day. Large portion — fuel for the afternoon.' },
  { id:'dishes2',     time:'13:50', label:'Clean Up',              type:'routine',  duration:10,  emoji:'🧹', note:'Quick clean. Clear space = clear mind for study.' },
  { id:'study2',      time:'14:00', label:'Study / Revision',      type:'study',    duration:90,  emoji:'📚', note:'Review morning notes. Do assignments. No music with lyrics.' },
  { id:'coding',      time:'15:30', label:'Coding Block',          type:'coding',   duration:90,  emoji:'💻', note:'Build something real. Work on a project. Practice beats tutorials every time.' },
  { id:'bae',         time:'17:00', label:'Bae Time 💕',           type:'personal', duration:90,  emoji:'💕', note:'Protected time. Phone down. Be fully present.' },
  { id:'dinner_prep', time:'18:30', label:'Prepare Dinner',        type:'meal',     duration:20,  emoji:'🍲', note:'Start cooking. Check Meals tab for tonight\'s dinner.' },
  { id:'dinner',      time:'18:50', label:'Eat Dinner',            type:'meal',     duration:25,  emoji:'🍽️', note:'Eat well. This fuels your overnight muscle recovery.' },
  { id:'dishes3',     time:'19:15', label:'Clean Kitchen',         type:'routine',  duration:10,  emoji:'🧹', note:'Full clean. Good kitchen tonight = easy morning tomorrow.' },
  { id:'freetime',    time:'19:25', label:'Free Time 🎧',          type:'personal', duration:60,  emoji:'🎧', note:'THIS is when you scroll TikTok. Not at 6am. Earned free time.' },
  { id:'review',      time:'20:25', label:'Daily Review',          type:'routine',  duration:20,  emoji:'📝', note:'What did you learn? What to do differently? Write 3 lines.' },
  { id:'night_prep',  time:'20:45', label:'Night Prep',            type:'routine',  duration:15,  emoji:'🌙', note:'Set clothes, pack bag, set alarm. Drink milk before bed.' },
  { id:'sleep',       time:'21:00', label:'Sleep',                 type:'sleep',    duration:540, emoji:'😴', note:'Phone in another room. 9 hours = max muscle growth + memory.' },
];

const WEEKEND_BLOCKS = [
  { id:'wake',           time:'07:00', label:'Wake Up — No Phone',       type:'routine',  duration:20,  emoji:'⏰', note:'Weekend — sleep in until 7. No alarm scrolling. Drink water.' },
  { id:'bfast_prep',     time:'07:20', label:'Prepare Breakfast',         type:'meal',     duration:25,  emoji:'🍳', note:'Weekend breakfast is bigger. Check Meals tab — better meals unlocked.' },
  { id:'breakfast',      time:'07:45', label:'Eat Breakfast',              type:'meal',     duration:30,  emoji:'🍽️', note:'Sit down. Take your time. Best breakfast of the week.' },
  { id:'dishes1',        time:'08:15', label:'Clean Dishes',               type:'routine',  duration:15,  emoji:'🧹', note:'Clean dishes after breakfast.' },
  { id:'laundry_sort',   time:'08:30', label:'Sort & Start Laundry',       type:'chores',   duration:30,  emoji:'👕', note:'Sort clothes, start soaking or machine wash. Do this first so clothes dry by afternoon.' },
  { id:'study_weekend',  time:'09:00', label:'Study / Revision Block',     type:'study',    duration:120, emoji:'📚', note:'Weekend study — go deeper on topics you did not fully understand this week.' },
  { id:'coding_weekend', time:'11:00', label:'Coding / Project Block',     type:'coding',   duration:90,  emoji:'💻', note:'Build. Ship something. Weekends are for bigger ideas.' },
  { id:'laundry_hang',   time:'12:30', label:'Hang / Check Laundry',       type:'chores',   duration:15,  emoji:'👕', note:'Hang clothes out to dry or move to dryer. Quick task.' },
  { id:'lunch_prep',     time:'12:45', label:'Prepare Lunch',              type:'meal',     duration:30,  emoji:'🍲', note:'Weekend lunch is better — try pilau, biryani or a special stew. Check Meals tab.' },
  { id:'lunch',          time:'13:15', label:'Eat Lunch',                  type:'meal',     duration:30,  emoji:'🍽️', note:'Best meal of the week. Eat a generous portion.' },
  { id:'dishes2',        time:'13:45', label:'Clean Up',                   type:'routine',  duration:15,  emoji:'🧹', note:'Full kitchen clean after lunch.' },
  { id:'house_clean',    time:'14:00', label:'Clean House / Room',         type:'chores',   duration:60,  emoji:'🏠', note:'Full room clean — sweep, mop, arrange, take out trash. Weekly reset.' },
  { id:'bae_weekend',    time:'15:00', label:'Bae Time 💕',                type:'personal', duration:120, emoji:'💕', note:'Weekend bae time is longer. Plan something nice — a walk, a meal together.' },
  { id:'laundry_fold',   time:'17:00', label:'Fold & Put Away Clothes',    type:'chores',   duration:20,  emoji:'👕', note:'Fold and put away dry clothes. Feels great to have clean clothes sorted.' },
  { id:'dinner_prep',    time:'17:30', label:'Prepare Dinner',             type:'meal',     duration:30,  emoji:'🍲', note:'Weekend dinner is special too. Take your time cooking.' },
  { id:'dinner',         time:'18:00', label:'Eat Dinner',                 type:'meal',     duration:30,  emoji:'🍽️', note:'Relax and enjoy. Best dinner of the week.' },
  { id:'dishes3',        time:'18:30', label:'Clean Kitchen',              type:'routine',  duration:15,  emoji:'🧹', note:'Full kitchen clean. Sets up the week ahead.' },
  { id:'prep_next_week', time:'18:45', label:'Plan Next Week',             type:'routine',  duration:30,  emoji:'📋', note:'What do you want to achieve? Any big purchases? Buy groceries in bulk tonight or tomorrow morning.' },
  { id:'freetime',       time:'19:15', label:'Free Time 🎧',               type:'personal', duration:90,  emoji:'🎧', note:'Extended weekend free time. Relax, music, TikTok — you\'ve earned a longer break.' },
  { id:'review',         time:'20:45', label:'Weekly Review',              type:'routine',  duration:20,  emoji:'📝', note:'What did you achieve this week? What will you do differently next week? Write 5 lines.' },
  { id:'sleep',          time:'21:30', label:'Sleep',                      type:'sleep',    duration:510, emoji:'😴', note:'Weekend sleep in is allowed. Phone in another room. Rest fully.' },
];

const TYPE_COLORS = {
  routine:  { bg:'rgba(99,102,241,0.12)',  border:'rgba(99,102,241,0.35)',  text:'#818CF8', dot:'#6366F1' },
  meal:     { bg:'rgba(245,158,11,0.12)',  border:'rgba(245,158,11,0.35)',  text:'#FCD34D', dot:'#F59E0B' },
  study:    { bg:'rgba(59,130,246,0.12)',  border:'rgba(59,130,246,0.35)',  text:'#93C5FD', dot:'#3B82F6' },
  school:   { bg:'rgba(139,92,246,0.12)', border:'rgba(139,92,246,0.35)',  text:'#C4B5FD', dot:'#8B5CF6' },
  coding:   { bg:'rgba(16,185,129,0.12)', border:'rgba(16,185,129,0.35)',  text:'#6EE7B7', dot:'#10B981' },
  personal: { bg:'rgba(236,72,153,0.12)', border:'rgba(236,72,153,0.35)',  text:'#F9A8D4', dot:'#EC4899' },
  chores:   { bg:'rgba(234,179,8,0.12)',  border:'rgba(234,179,8,0.35)',   text:'#FDE047', dot:'#EAB308' },
  sleep:    { bg:'rgba(30,41,59,0.5)',    border:'rgba(51,65,85,0.5)',     text:'#475569', dot:'#334155' },
};
const TYPE_LABELS = { routine:'Routine', meal:'Meal', study:'Study', school:'School', coding:'Coding', personal:'Personal', chores:'Chores', sleep:'Sleep' };

const NOTIF_MSGS = {
  routine: (b) => ({ title:'⏰ ' + b.label.toUpperCase(), body: b.note }),
  meal: (b) => ({ title: b.label.includes('Eat') ? '🍽️ TIME TO EAT' : '🍳 START COOKING NOW', body: b.label.includes('Eat') ? `${b.emoji} ${b.label} — eat properly, no phone` : `Cook now so food is ready on time. Check Meals tab.` }),
  study: (b) => ({ title:'📚 STUDY TIME', body:`Put your phone in another room. ${b.note}` }),
  coding: (b) => ({ title:'💻 CODING TIME', body:`Open your editor. Build something real. ${b.duration} minutes.` }),
  school: (b) => ({ title:'🏫 SCHOOL TIME', body:`Be present. Take notes. Ask questions.` }),
  personal: (b) => ({ title: b.label.includes('Bae') ? '💕 BAE TIME' : '🎧 FREE TIME', body: b.note }),
  chores: (b) => ({ title:'🏠 CHORES TIME', body: b.note }),
  sleep: (b) => ({ title:'😴 TIME TO SLEEP', body:'Phone in another room. 9 hours = best recovery.' }),
};

function t2m(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }
function m2t(m) { return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
function fmt12(t) { const [h,m] = t.split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; }

async function requestNotif() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

function fireNotif(title, body, requireInteraction = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon:'/icon-192.png', badge:'/icon-192.png', requireInteraction, vibrate:[200,100,200,100,200] }); } catch(e) {}
}

function scheduleAll(blocks) {
  const now = new Date();
  const nowMs = now.getTime();
  blocks.forEach(b => {
    const bMins = t2m(b.time);
    const startMs = new Date().setHours(Math.floor(bMins/60), bMins%60, 0, 0);
    const diff = startMs - nowMs;
    const msgs = NOTIF_MSGS[b.type] ? NOTIF_MSGS[b.type](b) : { title:`⏰ ${b.label}`, body: b.note };
    const important = ['meal','study','coding','sleep','school'].includes(b.type);

    if (diff > 0 && diff < 86400000) {
      setTimeout(() => fireNotif(msgs.title, msgs.body, important), diff);
    }
    // Cook warning 25 min before eating
    if (b.type === 'meal' && b.label.includes('Eat')) {
      const d = startMs - 25*60*1000 - nowMs;
      if (d > 0) setTimeout(() => fireNotif('🍳 START COOKING NOW', `Start preparing now so ${b.label.replace('Eat ','')} is ready by ${fmt12(b.time)}`, true), d);
    }
    // Walk warning 12 min before school
    if (b.type === 'school') {
      const d = startMs - 12*60*1000 - nowMs;
      if (d > 0) setTimeout(() => fireNotif('🚶 LEAVE FOR SCHOOL NOW', `Start your 10-min walk to arrive by ${fmt12(b.time)}`, true), d);
    }
    // 5 min warning for study/coding
    if (b.type === 'study' || b.type === 'coding') {
      const d = startMs - 5*60*1000 - nowMs;
      if (d > 0) setTimeout(() => fireNotif(`⚠️ ${b.label} in 5 minutes`, `Put your phone down now. ${b.note}`), d);
    }
    // 30 min wind-down before sleep
    if (b.type === 'sleep') {
      const d = startMs - 30*60*1000 - nowMs;
      if (d > 0) setTimeout(() => fireNotif('🌙 Wind Down in 30 Minutes', 'Start wrapping up everything. Put the phone down.'), d);
    }
    // Free time notification
    if (b.type === 'personal' && b.label.includes('Free')) {
      if (diff > 0 && diff < 86400000) {
        setTimeout(() => fireNotif('🎧 FREE TIME UNLOCKED', `You have ${b.duration} minutes of earned free time. Enjoy!`), diff);
      }
    }
  });
}

function EditModal({ block, onSave, onClose }) {
  const [s, setS] = useState({ ...block });
  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width:36, height:4, background:'var(--border)', borderRadius:2, margin:'12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize:16, fontWeight:700 }}>Edit Block</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {[['Start Time','time','time'],['Label','label','text'],['Duration (minutes)','duration','number'],['Reminder Note','note','text']].map(([l,k,t]) => (
            <div key={k}>
              <label style={{ fontSize:12, color:'var(--text-3)', fontWeight:600, letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:8 }}>{l}</label>
              <input className={`input${k==='duration'?' font-num':''}`} type={t} value={s[k]} onChange={e => setS(p => ({ ...p, [k]: t==='number' ? Number(e.target.value) : e.target.value }))} />
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
  const isWeekend = [0,6].includes(new Date().getDay());
  const [weekdayBlocks, setWeekdayBlocks] = useState(WEEKDAY_BLOCKS);
  const [weekendBlocks, setWeekendBlocks] = useState(WEEKEND_BLOCKS);
  const [viewWeekend, setViewWeekend] = useState(isWeekend);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifPerm, setNotifPerm] = useState('default');
  const [completedIds, setCompletedIds] = useState([]);
  const [now, setNow] = useState(new Date());
  const [tab, setTab] = useState('today');
  const [editBlock, setEditBlock] = useState(null);

  const blocks = viewWeekend ? weekendBlocks : weekdayBlocks;

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    async function load() {
      const wd = await getSetting('planner_weekday', null);
      const we = await getSetting('planner_weekend', null);
      if (wd) setWeekdayBlocks(wd);
      if (we) setWeekendBlocks(we);
      const done = await getSetting(`planner_done_${todayISO()}`, []);
      if (done) setCompletedIds(done);
      const ne = await getSetting('planner_notifs', false);
      setNotifEnabled(ne);
      if ('Notification' in window) setNotifPerm(Notification.permission);
    }
    load();
  }, []);

  async function saveBlocks(nb, weekend) {
    const sorted = [...nb].sort((a,b) => t2m(a.time) - t2m(b.time));
    if (weekend) { setWeekendBlocks(sorted); await setSetting('planner_weekend', sorted); }
    else { setWeekdayBlocks(sorted); await setSetting('planner_weekday', sorted); }
  }

  async function toggleDone(id) {
    const updated = completedIds.includes(id) ? completedIds.filter(x=>x!==id) : [...completedIds, id];
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
      fireNotif('🟢 Fedha Planner Active', `All reminders are on. You will be notified for every block${isWeekend?' (weekend schedule)':' (weekday schedule)'}.`, false);
    }
  }

  async function handleEditSave(updated) {
    await saveBlocks(blocks.map(b => b.id===updated.id ? updated : b), viewWeekend);
    setEditBlock(null);
    if (notifEnabled) scheduleAll(blocks);
  }

  const nowMins = now.getHours()*60+now.getMinutes();
  const currentBlock = blocks.find(b => nowMins>=t2m(b.time) && nowMins<t2m(b.time)+b.duration);
  const currentProgress = currentBlock ? ((nowMins-t2m(currentBlock.time))/currentBlock.duration)*100 : 0;
  const nextBlock = blocks.find(b => t2m(b.time) > nowMins);
  const totalNonSleep = blocks.filter(b => b.type!=='sleep').length;
  const pct = Math.round((completedIds.length/totalNonSleep)*100);

  return (
    <Layout fab={false}>
      <div className="page">
        <div className="page-header">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
            <h1 style={{ fontSize:22, fontWeight:700 }}>Daily Planner</h1>
            <span className="font-num" style={{ fontSize:13, color:'var(--text-3)' }}>{format(now,'h:mm a')}</span>
          </div>
          <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:16 }}>{format(now,'EEEE, d MMMM yyyy')}</div>

          {/* Notif banners */}
          {!notifEnabled && notifPerm !== 'denied' && (
            <button onClick={enableNotifs} style={{ width:'100%', padding:'12px 16px', background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:12, display:'flex', alignItems:'center', gap:12, cursor:'pointer', marginBottom:14, textAlign:'left' }}>
              <span style={{ fontSize:22 }}>🔔</span>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--green)', fontFamily:'Outfit' }}>Turn On All Reminders</div>
                <div style={{ fontSize:12, color:'var(--text-3)' }}>Meals (with cooking warnings), school walk, study, coding, bae time, free time, sleep</div>
              </div>
            </button>
          )}
          {notifPerm === 'denied' && !notifEnabled && (
            <div style={{ padding:'10px 14px', background:'var(--red-dim)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, fontSize:13, color:'var(--red)', marginBottom:14 }}>
              🔕 Blocked — Settings → Chrome → Notifications → Allow this site
            </div>
          )}
          {notifEnabled && (
            <div style={{ padding:'10px 14px', background:'var(--green-dim)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:10, fontSize:13, color:'var(--green)', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              🔔 All reminders active for today's {viewWeekend ? 'weekend' : 'weekday'} schedule
            </div>
          )}

          {/* Weekday / Weekend toggle */}
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <button className={`chip ${!viewWeekend?'active':''}`} onClick={() => setViewWeekend(false)}>📅 Weekday</button>
            <button className={`chip ${viewWeekend?'active':''}`} onClick={() => setViewWeekend(true)}>🎉 Weekend</button>
            <button className={`chip ${tab==='edit'?'active':''}`} onClick={() => setTab(t => t==='edit'?'today':'edit')}>⚙️ Edit</button>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className={`chip ${tab==='today'?'active':''}`} onClick={() => setTab('today')}>Today</button>
            <button className={`chip ${tab==='stats'?'active':''}`} onClick={() => setTab('stats')}>Stats</button>
          </div>
        </div>

        <div style={{ padding:'0 20px' }}>

          {/* TODAY */}
          {tab === 'today' && (
            <>
              {currentBlock && (
                <div style={{ marginBottom:16 }}>
                  <div className="section-title">RIGHT NOW</div>
                  <div style={{ background:TYPE_COLORS[currentBlock.type].bg, border:`2px solid ${TYPE_COLORS[currentBlock.type].border}`, borderRadius:16, padding:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                      <span style={{ fontSize:28 }}>{currentBlock.emoji}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:16, fontWeight:700, color:TYPE_COLORS[currentBlock.type].text }}>{currentBlock.label}</div>
                        <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>
                          Until {fmt12(m2t(t2m(currentBlock.time)+currentBlock.duration))} · {Math.max(0, currentBlock.duration - Math.floor(nowMins-t2m(currentBlock.time)))} min left
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

              {nextBlock && (
                <div style={{ marginBottom:16 }}>
                  <div className="section-title">UP NEXT</div>
                  <div className="card" style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:22 }}>{nextBlock.emoji}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{nextBlock.label}</div>
                      <div style={{ fontSize:12, color:'var(--text-3)' }}>Starts {fmt12(nextBlock.time)} · in {Math.max(0,t2m(nextBlock.time)-nowMins)} min</div>
                    </div>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:TYPE_COLORS[nextBlock.type].dot, flexShrink:0 }} />
                  </div>
                </div>
              )}

              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div className="section-title" style={{ marginBottom:0 }}>PROGRESS</div>
                  <div style={{ fontSize:13, color:'var(--green)', fontWeight:600 }}>{completedIds.length}/{totalNonSleep} · {pct}%</div>
                </div>
                <div className="progress-bar" style={{ height:8 }}>
                  <div className="progress-fill" style={{ width:`${pct}%`, background:'var(--green)' }} />
                </div>
              </div>

              <div className="section-title">FULL SCHEDULE {viewWeekend ? '(WEEKEND)' : '(WEEKDAY)'}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:24 }}>
                {blocks.map(block => {
                  const isNow = nowMins>=t2m(block.time) && nowMins<t2m(block.time)+block.duration;
                  const isPast = nowMins >= t2m(block.time)+block.duration;
                  const isDone = completedIds.includes(block.id);
                  const c = TYPE_COLORS[block.type];
                  return (
                    <div key={block.id} style={{ display:'flex', alignItems:'flex-start', gap:8, opacity: isPast&&!isDone ? 0.45 : 1 }}>
                      <div style={{ width:56, flexShrink:0, paddingTop:11, textAlign:'right' }}>
                        <div className="font-num" style={{ fontSize:11, color: isNow ? c.text : 'var(--text-3)', fontWeight: isNow ? 700 : 400, lineHeight:1.3, whiteSpace:'pre-line' }}>
                          {fmt12(block.time).replace(' ','\n')}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:11 }}>
                        <div style={{ width:12, height:12, borderRadius:'50%', background: isNow ? c.dot : isDone ? 'var(--green)' : 'var(--border)', flexShrink:0, boxShadow: isNow ? `0 0 8px ${c.dot}70` : 'none' }} />
                        <div style={{ width:2, flex:1, background:'var(--border)', minHeight:16, marginTop:4 }} />
                      </div>
                      <div style={{ flex:1, background: isNow ? c.bg : isDone ? 'rgba(16,185,129,0.06)' : 'var(--card)', border:`1px solid ${isNow ? c.border : isDone ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`, borderRadius:10, padding:'10px 12px', marginBottom:2, cursor:'pointer' }}
                        onClick={() => toggleDone(block.id)}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:16, flexShrink:0 }}>{isDone ? '✅' : block.emoji}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, color: isNow ? c.text : isDone ? 'var(--text-3)' : 'var(--text)', textDecoration: isDone ? 'line-through' : 'none' }}>{block.label}</div>
                            <div style={{ fontSize:11, color:'var(--text-3)', marginTop:1 }}>
                              {block.duration<60 ? `${block.duration} min` : `${Math.floor(block.duration/60)}h${block.duration%60>0?' '+block.duration%60+'m':''}`}
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
                💡 Tap any block to mark done. Resets automatically each day.
              </div>
            </>
          )}

          {/* STATS */}
          {tab === 'stats' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:24 }}>
              {[
                { label:'Study Time', v: blocks.filter(b=>b.type==='study').reduce((s,b)=>s+b.duration,0), color:'#3B82F6', emoji:'📚' },
                { label:'Coding Time', v: blocks.filter(b=>b.type==='coding').reduce((s,b)=>s+b.duration,0), color:'#10B981', emoji:'💻' },
                { label:'Bae Time', v: blocks.filter(b=>b.type==='personal'&&b.label.toLowerCase().includes('bae')).reduce((s,b)=>s+b.duration,0), color:'#EC4899', emoji:'💕' },
                { label:'Chores', v: blocks.filter(b=>b.type==='chores').reduce((s,b)=>s+b.duration,0), color:'#EAB308', emoji:'🏠', showIfZero:false },
                { label:'Meals', v: blocks.filter(b=>b.type==='meal'&&b.label.includes('Eat')).length, color:'#F59E0B', emoji:'🍽️', isCount:true },
                { label:'Free Time', v: blocks.filter(b=>b.type==='personal'&&b.label.includes('Free')).reduce((s,b)=>s+b.duration,0), color:'#94A3B8', emoji:'🎧' },
              ].filter(s => s.showIfZero!==false || s.v>0).map(s => (
                <div key={s.label} className="card" style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:`${s.color}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{s.emoji}</div>
                  <div style={{ flex:1, fontSize:14, fontWeight:600 }}>{s.label}</div>
                  <div className="font-num" style={{ fontSize:15, fontWeight:700, color:s.color }}>
                    {s.isCount ? `${s.v} meals` : s.v<60 ? `${s.v}m` : `${Math.floor(s.v/60)}h${s.v%60>0?' '+s.v%60+'m':''}`}
                  </div>
                </div>
              ))}
              <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, padding:'14px 16px' }}>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--red)', marginBottom:8 }}>⚠️ The 6am Scroll Problem</div>
                <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>
                  Your free time is in the evening after everything is done. Every minute on TikTok at 6am is stolen from your sharpest brain hours. Put the phone in another room when you wake up.
                </div>
              </div>
            </div>
          )}

          {/* EDIT */}
          {tab === 'edit' && (
            <div style={{ marginBottom:24 }}>
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                <button className={`chip ${!viewWeekend?'active':''}`} onClick={() => setViewWeekend(false)}>Edit Weekday</button>
                <button className={`chip ${viewWeekend?'active':''}`} onClick={() => setViewWeekend(true)}>Edit Weekend</button>
              </div>
              <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:16 }}>Tap any block to adjust time, duration or note.</div>
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
              <button className="btn-ghost" style={{ marginTop:12 }} onClick={() => saveBlocks(viewWeekend ? WEEKEND_BLOCKS : WEEKDAY_BLOCKS, viewWeekend)}>
                Reset {viewWeekend ? 'Weekend' : 'Weekday'} to Default
              </button>
            </div>
          )}
        </div>
      </div>
      {editBlock && <EditModal block={editBlock} onSave={handleEditSave} onClose={() => setEditBlock(null)} />}
    </Layout>
  );
}
