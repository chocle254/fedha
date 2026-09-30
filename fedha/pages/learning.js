import { useState } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { resizeImage, genId } from '../lib/utils';

const EMPTY = {
  title: '', provider: '', url: '', description: '', priority: 3,
  status: 'active', deadline: '', estimated_hours: 20, weekly_hours: 4,
  completed_minutes: 0, notes: '', modules: [], certificate: null,
};

const PRIORITIES = [
  { value: 5, label: 'Critical — must make time' },
  { value: 4, label: 'High — important' },
  { value: 3, label: 'Medium — steady progress' },
  { value: 2, label: 'Low — when time allows' },
  { value: 1, label: 'Optional' },
];

function hoursLeft(c) {
  return Math.max(0, Number(c.estimated_hours || 0) - Number(c.completed_minutes || 0) / 60);
}
function progress(c) {
  const total = Math.max(1, Number(c.estimated_hours || 0) * 60);
  return Math.min(100, Math.round((Number(c.completed_minutes || 0) / total) * 100));
}
function daysLeft(c) {
  if (!c.deadline) return null;
  const d = Math.ceil((new Date(c.deadline + 'T23:59:59').getTime() - Date.now()) / 86400000);
  return d;
}

function Field({ label, children }) {
  return <div style={{ marginBottom: 14 }}>
    <label style={{ display:'block', fontSize:11, color:'var(--text-3)', fontWeight:700, letterSpacing:1, textTransform:'uppercase', marginBottom:7 }}>{label}</label>
    {children}
  </div>;
}

export default function LearningPage() {
  const { courses, addCourse, updateCourse, removeCourse, addCertificate } = useApp();
  const [selected, setSelected] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleMinutes, setModuleMinutes] = useState('');
  const [savingCert, setSavingCert] = useState(false);

  const active = courses.filter(c => c.status !== 'completed');
  const completed = courses.filter(c => c.status === 'completed');

  function openNew() { setForm({ ...EMPTY, modules: [] }); setSelected(null); setFormOpen(true); }
  function openEdit(c) { setForm({ ...EMPTY, ...c }); setSelected(c); setFormOpen(true); }

  async function save() {
    if (!form.title.trim()) return;
    const normalized = {
      ...form,
      title: form.title.trim(),
      priority: Number(form.priority),
      estimated_hours: Math.max(0.5, Number(form.estimated_hours) || 1),
      weekly_hours: Math.max(0.25, Number(form.weekly_hours) || 1),
      modules: (form.modules || []).map(m => ({ ...m, minutes: Number(m.minutes) || 30 })),
    };
    if (selected) await updateCourse(normalized);
    else await addCourse(normalized);
    setFormOpen(false);
  }

  function addModule() {
    if (!moduleTitle.trim()) return;
    setForm(f => ({ ...f, modules: [...(f.modules || []), { id: genId(), title: moduleTitle.trim(), minutes: Number(moduleMinutes) || 60, completed: false, notes: '' }] }));
    setModuleTitle(''); setModuleMinutes('');
  }

  async function toggleModule(course, moduleId) {
    const modules = (course.modules || []).map(m => m.id === moduleId ? { ...m, completed: !m.completed } : m);
    const completedMinutes = modules.filter(m => m.completed).reduce((s,m) => s + Number(m.minutes || 0), 0);
    const done = modules.length > 0 && modules.every(m => m.completed);
    await updateCourse({ ...course, modules, completed_minutes: Math.min(Number(course.estimated_hours || 0) * 60, Math.max(Number(course.completed_minutes || 0), completedMinutes)), status: done ? 'completed' : 'active' });
  }

  async function addNotes(course, notes) {
    await updateCourse({ ...course, notes });
  }

  async function uploadCertificate(e, course) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSavingCert(true);
    try {
      const image = await resizeImage(file, 1400);
      const cert = {
        title: course.title,
        achievement: 'Course Certificate',
        organization: course.provider || 'Course Provider',
        date_earned: new Date().toISOString(),
        recipient_name: 'Me',
        description: course.description || 'Certificate earned after completing this course.',
        image,
        source: 'course',
        course_id: course.id,
      };
      await addCertificate(cert);
      await updateCourse({ ...course, status: 'completed', certificate: { ...cert, image } });
    } finally { setSavingCert(false); }
  }

  return (
    <Layout fab={false}>
      <div style={{ minHeight:'100vh', paddingBottom:90 }}>
        <div style={{ maxWidth:1000, margin:'0 auto', padding:'28px 18px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:22 }}>
            <div>
              <div style={{ fontSize:11, color:'var(--green)', fontWeight:800, letterSpacing:2, textTransform:'uppercase' }}>LEARNING HUB</div>
              <h1 style={{ margin:'5px 0 6px', fontSize:28 }}>Courses & Certifications</h1>
              <p style={{ margin:0, color:'var(--text-3)', fontSize:13, lineHeight:1.6 }}>Store what you are learning, take notes, track the hours, and let the Planner decide when it deserves your time.</p>
            </div>
            <button className="btn-primary" onClick={openNew}>＋ Course</button>
          </div>

          <div className="card" style={{ padding:16, marginBottom:18, background:'linear-gradient(135deg, rgba(16,185,129,.10), rgba(59,130,246,.07))' }}>
            <div style={{ fontWeight:800, marginBottom:6 }}>🧠 Smart scheduling is connected</div>
            <div style={{ color:'var(--text-2)', fontSize:13, lineHeight:1.6 }}>Course priority, deadline, hours remaining and weekly study target feed the Planner. When serious client work or a course deadline arrives, lower-priority leisure and side work can give up its time instead of the planner blindly keeping the old routine.</div>
          </div>

          {active.length === 0 && completed.length === 0 && (
            <div className="card" style={{ padding:32, textAlign:'center' }}>
              <div style={{ fontSize:42 }}>🎓</div>
              <div style={{ fontWeight:800, marginTop:8 }}>Start your learning library</div>
              <div style={{ color:'var(--text-3)', fontSize:13, margin:'6px 0 16px' }}>Add an AI/ML, programming, startup, cloud or any other course you are serious about.</div>
              <button className="btn-primary" onClick={openNew}>Add your first course</button>
            </div>
          )}

          {active.map(course => (
            <CourseCard key={course.id} course={course} onOpen={() => setSelected(course)} onEdit={() => openEdit(course)} onDelete={() => removeCourse(course.id)} onModule={toggleModule} />
          ))}

          {completed.length > 0 && (
            <div style={{ marginTop:28 }}>
              <div style={{ fontSize:12, fontWeight:800, color:'var(--text-3)', letterSpacing:1.5, textTransform:'uppercase', marginBottom:10 }}>Completed / Certified</div>
              {completed.map(course => <CourseCard key={course.id} course={course} onOpen={() => setSelected(course)} onEdit={() => openEdit(course)} onDelete={() => removeCourse(course.id)} onModule={toggleModule} />)}
            </div>
          )}
        </div>
      </div>

      {formOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setFormOpen(false)}>
          <div className="modal-sheet" style={{ maxHeight:'92vh', overflowY:'auto' }}>
            <div style={{ width:36,height:4,background:'var(--border)',borderRadius:2,margin:'12px auto' }} />
            <div className="modal-header"><span style={{fontWeight:800}}>{selected ? 'Edit Course' : 'Add Course'}</span><button className="btn-icon" onClick={() => setFormOpen(false)}>✕</button></div>
            <div className="modal-body">
              <Field label="Course name"><input className="input" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Deep Learning Specialization" /></Field>
              <Field label="Provider"><input className="input" value={form.provider} onChange={e=>setForm({...form,provider:e.target.value})} placeholder="Coursera, NVIDIA, Udemy..." /></Field>
              <Field label="Course link"><input className="input" value={form.url} onChange={e=>setForm({...form,url:e.target.value})} placeholder="https://..." /></Field>
              <Field label="Why / what you will learn"><textarea className="input" rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} /></Field>
              <Field label="Seriousness / priority"><select className="input" value={form.priority} onChange={e=>setForm({...form,priority:Number(e.target.value)})}>{PRIORITIES.map(p=><option key={p.value} value={p.value}>{p.value} — {p.label}</option>)}</select></Field>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <Field label="Estimated total hours"><input className="input" type="number" min="0.5" step="0.5" value={form.estimated_hours} onChange={e=>setForm({...form,estimated_hours:e.target.value})}/></Field>
                <Field label="Study hours / week"><input className="input" type="number" min="0.25" step="0.25" value={form.weekly_hours} onChange={e=>setForm({...form,weekly_hours:e.target.value})}/></Field>
              </div>
              <Field label="Target completion date"><input className="input" type="date" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})}/></Field>

              <div style={{borderTop:'1px solid var(--border)',paddingTop:15,marginTop:4}}>
                <div style={{fontSize:12,fontWeight:800,marginBottom:10}}>📚 Course sections</div>
                {(form.modules || []).map((m,i)=><div key={m.id} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 10px',background:'var(--card-2)',borderRadius:9,marginBottom:6}}>
                  <span style={{color:m.completed?'var(--green)':'var(--text-3)'}}>{m.completed?'✓':'○'}</span><span style={{flex:1,fontSize:13}}>{i+1}. {m.title}</span><span style={{fontSize:11,color:'var(--text-3)'}}>{m.minutes}m</span>
                  <button className="btn-icon" onClick={()=>setForm(f=>({...f,modules:f.modules.filter(x=>x.id!==m.id)}))}>✕</button>
                </div>)}
                <div style={{display:'grid',gridTemplateColumns:'1fr 90px',gap:7}}>
                  <input className="input" placeholder="Module / lesson" value={moduleTitle} onChange={e=>setModuleTitle(e.target.value)}/>
                  <input className="input" type="number" placeholder="mins" value={moduleMinutes} onChange={e=>setModuleMinutes(e.target.value)}/>
                </div>
                <button className="btn-ghost" style={{width:'100%',marginTop:7}} onClick={addModule}>＋ Add section</button>
              </div>

              <button className="btn-primary" style={{width:'100%',marginTop:18}} onClick={save}>Save Course</button>
            </div>
          </div>
        </div>
      )}

      {selected && !formOpen && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setSelected(null)}>
          <div className="modal-sheet" style={{maxHeight:'92vh',overflowY:'auto'}}>
            <div style={{width:36,height:4,background:'var(--border)',borderRadius:2,margin:'12px auto'}}/>
            <div className="modal-header"><span style={{fontWeight:800}}>🎓 {selected.title}</span><button className="btn-icon" onClick={()=>setSelected(null)}>✕</button></div>
            <div className="modal-body">
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
                <span className="badge">{selected.provider || 'Self study'}</span>
                <span className="badge">Priority P{selected.priority || 3}</span>
                {selected.deadline && <span className="badge">{daysLeft(selected) < 0 ? 'Overdue' : daysLeft(selected) + 'd left'}</span>}
              </div>
              <div style={{fontSize:13,color:'var(--text-2)',lineHeight:1.6,marginBottom:16}}>{selected.description || 'Keep learning and log your progress here.'}</div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text-3)',marginBottom:6}}><span>{progress(selected)}% complete</span><span>{hoursLeft(selected).toFixed(1)}h remaining</span></div>
              <div style={{height:7,background:'var(--card-2)',borderRadius:10,overflow:'hidden',marginBottom:18}}><div style={{height:'100%',width:progress(selected)+'%',background:'var(--green)',borderRadius:10}}/></div>

              <div style={{fontSize:12,fontWeight:800,letterSpacing:1,textTransform:'uppercase',marginBottom:9}}>Sections</div>
              {(selected.modules || []).length ? selected.modules.map((m,i)=><div key={m.id} onClick={async()=>{await toggleModule(selected,m.id);setSelected({...selected,modules:selected.modules.map(x=>x.id===m.id?{...x,completed:!x.completed}:x)});}} style={{padding:'11px 10px',border:'1px solid var(--border)',borderRadius:10,marginBottom:7,cursor:'pointer',display:'flex',gap:9,alignItems:'center'}}><span>{m.completed?'✅':'⭕'}</span><span style={{flex:1,fontSize:13}}>{i+1}. {m.title}</span><span style={{fontSize:11,color:'var(--text-3)'}}>{m.minutes}m</span></div>) : <div style={{fontSize:12,color:'var(--text-3)',marginBottom:15}}>No sections yet. Edit the course to add them.</div>}

              <Field label="Study notes"><textarea className="input" rows={7} value={selected.notes || ''} onChange={e=>setSelected({...selected,notes:e.target.value})} onBlur={()=>addNotes(selected,selected.notes)} placeholder="Write your AI/ML notes, formulas, ideas, commands, things to revisit..." /></Field>

              {selected.url && <a href={selected.url} target="_blank" rel="noreferrer" className="btn-ghost" style={{display:'block',textAlign:'center',textDecoration:'none',marginBottom:10}}>🌐 Open Course</a>}

              <label className="btn-ghost" style={{display:'block',textAlign:'center',cursor:'pointer',marginBottom:10}}>
                {savingCert ? 'Processing…' : selected.certificate ? '🏆 Certificate Stored' : '📜 Add Course Certificate'}
                <input type="file" accept="image/*" style={{display:'none'}} disabled={savingCert} onChange={e=>uploadCertificate(e,selected)}/>
              </label>
              {selected.certificate?.image && <img src={selected.certificate.image} alt="Course certificate" style={{width:'100%',borderRadius:10,border:'1px solid var(--border)'}}/>}
              <button className="btn-primary" style={{width:'100%',marginTop:5}} onClick={()=>{setFormOpen(true);setForm({...EMPTY,...selected});setSelected(null)}}>Edit Course</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function CourseCard({ course, onOpen, onEdit, onDelete, onModule }) {
  const d = daysLeft(course);
  const p = progress(course);
  const urgent = d !== null && d <= 7 && d >= 0;
  return <div className="card" style={{padding:15,marginBottom:10,borderColor:urgent?'rgba(239,68,68,.45)':'var(--border)'}}>
    <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
      <div style={{width:44,height:44,borderRadius:12,background:'rgba(16,185,129,.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:23,flexShrink:0}}>🎓</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:8}}><div style={{fontWeight:800,fontSize:15}}>{course.title}</div><span style={{fontSize:11,color:course.status==='completed'?'var(--green)':urgent?'var(--red)':'var(--text-3)'}}>P{course.priority||3}</span></div>
        <div style={{fontSize:11,color:'var(--text-3)',marginTop:3}}>{course.provider||'Self study'} · {hoursLeft(course).toFixed(1)}h remaining{d!==null?' · '+(d<0?'overdue':d+'d left'):''}</div>
        <div style={{height:5,background:'var(--card-2)',borderRadius:8,overflow:'hidden',marginTop:10}}><div style={{height:'100%',width:p+'%',background:'var(--green)'}}/></div>
        <div style={{display:'flex',gap:7,marginTop:10}}>
          <button className="btn-ghost" style={{flex:1}} onClick={onOpen}>Open</button>
          <button className="btn-ghost" onClick={onEdit}>Edit</button>
          <button className="btn-icon" onClick={onDelete}>✕</button>
        </div>
      </div>
    </div>
  </div>;
}
