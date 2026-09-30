import { useState } from 'react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { resizeImage, genId } from '../lib/utils';

const EMPTY = {
  title:'', provider:'', url:'', description:'', priority:3, status:'active',
  deadline:'', estimated_hours:20, weekly_hours:4, completed_minutes:0,
  notes:'', modules:[], certificate:null,
};
const PRIORITIES = [
  {value:5,label:'Critical — must make time'},{value:4,label:'High — important'},
  {value:3,label:'Medium — steady progress'},{value:2,label:'Low — when time allows'},{value:1,label:'Optional'},
];
const TYPES = [
  {value:'video',label:'🎬 Video'},{value:'check',label:'🧠 Knowledge check'},
  {value:'reading',label:'📖 Reading'},{value:'assessment',label:'🏆 Assessment'},{value:'other',label:'📌 Activity'},
];
function hoursLeft(c){
  const ms=(c.modules||[]).reduce((s,m)=>s+Number(m.minutes||0),0);
  const total=ms>0?ms:Number(c.estimated_hours||0)*60;
  const done=(c.modules||[]).length?(c.modules||[]).filter(m=>m.completed).reduce((s,m)=>s+Number(m.minutes||0),0):Number(c.completed_minutes||0);
  return Math.max(0,(total-done)/60);
}
function progress(c){
  const ms=c.modules||[];
  if(ms.length)return Math.min(100,Math.round(ms.filter(m=>m.completed).length/ms.length*100));
  return Math.min(100,Math.round(Number(c.completed_minutes||0)/Math.max(1,Number(c.estimated_hours||0)*60)*100));
}
function daysLeft(c){return c.deadline?Math.ceil((new Date(c.deadline+'T23:59:59').getTime()-Date.now())/86400000):null;}
function Field({label,children}){return <div style={{marginBottom:14}}><label style={{display:'block',fontSize:11,color:'var(--text-3)',fontWeight:700,letterSpacing:1,textTransform:'uppercase',marginBottom:7}}>{label}</label>{children}</div>;}
function normalizeModules(modules=[]){return modules.map((m,i)=>({id:m.id||genId(),section:m.section||'Course content',title:m.title||`Lesson ${i+1}`,type:m.type||'video',minutes:Number(m.minutes)||10,completed:!!m.completed,notes:m.notes||'',url:m.url||''}));}

export default function LearningPage(){
  const {courses,addCourse,updateCourse,removeCourse,addCertificate}=useApp();
  const [selected,setSelected]=useState(null),[formOpen,setFormOpen]=useState(false),[form,setForm]=useState(EMPTY);
  const [lesson,setLesson]=useState({title:'',type:'video',minutes:'',section:'',url:''}),[savingCert,setSavingCert]=useState(false),[openLesson,setOpenLesson]=useState(null);
  const active=courses.filter(c=>c.status!=='completed'),completed=courses.filter(c=>c.status==='completed');

  function openNew(){setForm({...EMPTY,modules:[]});setSelected(null);setFormOpen(true);}
  function openEdit(c){setForm({...EMPTY,...c,modules:normalizeModules(c.modules)});setSelected(c);setFormOpen(true);}
  async function save(){
    if(!form.title.trim())return;
    const modules=normalizeModules(form.modules), mins=modules.reduce((s,m)=>s+Number(m.minutes||0),0);
    const normalized={...form,title:form.title.trim(),priority:Number(form.priority),estimated_hours:mins?Number((mins/60).toFixed(2)):Math.max(.5,Number(form.estimated_hours)||1),weekly_hours:Math.max(.25,Number(form.weekly_hours)||1),modules};
    if(normalized.status==='completed'&&modules.length)normalized.completed_minutes=mins;
    if(selected)await updateCourse(normalized);else await addCourse(normalized);
    setFormOpen(false);
  }
  function addLesson(){
    if(!lesson.title.trim())return;
    const next={id:genId(),section:lesson.section.trim()||'Course content',title:lesson.title.trim(),type:lesson.type,minutes:Number(lesson.minutes)||10,completed:false,notes:'',url:lesson.url.trim()};
    setForm(f=>({...f,modules:[...(f.modules||[]),next]}));setLesson({title:'',type:'video',minutes:'',section:lesson.section,url:''});
  }
  async function toggleLesson(course,id){
    const modules=normalizeModules(course.modules).map(m=>m.id===id?{...m,completed:!m.completed}:m),done=modules.length>0&&modules.every(m=>m.completed);
    const minutes=modules.filter(m=>m.completed).reduce((s,m)=>s+Number(m.minutes||0),0),total=modules.reduce((s,m)=>s+Number(m.minutes||0),0);
    const updated={...course,modules,completed_minutes:minutes,status:done?'completed':'active',estimated_hours:Number((total/60).toFixed(2))};
    await updateCourse(updated);setSelected(updated);
  }
  async function saveLessonNotes(course,id,notes){
    const updated=id==='__course__'?{...course,notes}:{...course,modules:normalizeModules(course.modules).map(m=>m.id===id?{...m,notes}:m)};
    await updateCourse(updated);setSelected(updated);
  }
  async function uploadCertificate(e,course){
    const file=e.target.files?.[0];if(!file)return;setSavingCert(true);
    try{
      const image=await resizeImage(file,1400),cert={title:course.title,achievement:'Course Certificate',organization:course.provider||'Course Provider',date_earned:new Date().toISOString(),recipient_name:'Me',description:course.description||'Certificate earned after completing this course.',image,source:'course',course_id:course.id};
      await addCertificate(cert);const updated={...course,status:'completed',certificate:{...cert,image}};await updateCourse(updated);setSelected(updated);
    }finally{setSavingCert(false);}
  }

  return <Layout fab={false}><div style={{minHeight:'100vh',paddingBottom:90}}><div style={{maxWidth:1000,margin:'0 auto',padding:'28px 18px'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,marginBottom:22}}>
      <div><div style={{fontSize:11,color:'var(--green)',fontWeight:800,letterSpacing:2,textTransform:'uppercase'}}>LEARNING HUB</div><h1 style={{margin:'5px 0 6px',fontSize:28}}>Courses & Certifications</h1><p style={{margin:0,color:'var(--text-3)',fontSize:13,lineHeight:1.6}}>Build your real course library: lessons, knowledge checks, readings, assessments, notes, progress and certificates.</p></div>
      <button className="btn-primary" onClick={openNew}>＋ Course</button>
    </div>
    <div className="card" style={{padding:16,marginBottom:18,background:'linear-gradient(135deg,rgba(16,185,129,.10),rgba(59,130,246,.07))'}}><div style={{fontWeight:800,marginBottom:6}}>🧠 Smart learning + Planner</div><div style={{color:'var(--text-2)',fontSize:13,lineHeight:1.6}}>Fedha now understands individual lessons and their durations. Course workload, progress, priority and deadline can compete for time with client work and other important commitments.</div></div>
    {active.length===0&&completed.length===0&&<div className="card" style={{padding:32,textAlign:'center'}}><div style={{fontSize:42}}>🎓</div><div style={{fontWeight:800,marginTop:8}}>Start your learning library</div><div style={{color:'var(--text-3)',fontSize:13,margin:'6px 0 16px'}}>Add an AI/ML, programming, startup, cloud or any other course.</div><button className="btn-primary" onClick={openNew}>Add your first course</button></div>}
    {active.map(c=><CourseCard key={c.id} course={c} onOpen={()=>setSelected(c)} onEdit={()=>openEdit(c)} onDelete={()=>removeCourse(c.id)}/>)}
    {completed.length>0&&<div style={{marginTop:28}}><div style={{fontSize:12,fontWeight:800,color:'var(--text-3)',letterSpacing:1.5,textTransform:'uppercase',marginBottom:10}}>Completed / Certified</div>{completed.map(c=><CourseCard key={c.id} course={c} onOpen={()=>setSelected(c)} onEdit={()=>openEdit(c)} onDelete={()=>removeCourse(c.id)}/>)}</div>}
  </div></div>

  {formOpen&&<div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setFormOpen(false)}><div className="modal-sheet" style={{maxHeight:'92vh',overflowY:'auto'}}><div style={{width:36,height:4,background:'var(--border)',borderRadius:2,margin:'12px auto'}}/><div className="modal-header"><span style={{fontWeight:800}}>{selected?'Edit Course':'Add Course'}</span><button className="btn-icon" onClick={()=>setFormOpen(false)}>✕</button></div><div className="modal-body">
    <Field label="Course name"><input className="input" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Introduction to Agents"/></Field>
    <Field label="Provider"><input className="input" value={form.provider} onChange={e=>setForm({...form,provider:e.target.value})} placeholder="Google, NVIDIA, Coursera, Udemy..."/></Field>
    <Field label="Course link"><input className="input" value={form.url} onChange={e=>setForm({...form,url:e.target.value})} placeholder="https://..."/></Field>
    <Field label="What will you learn?"><textarea className="input" rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
    <Field label="Seriousness / priority"><select className="input" value={form.priority} onChange={e=>setForm({...form,priority:Number(e.target.value)})}>{PRIORITIES.map(p=><option key={p.value} value={p.value}>{p.value} — {p.label}</option>)}</select></Field>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><Field label="Estimated hours (fallback)"><input className="input" type="number" min=".5" step=".5" value={form.estimated_hours} onChange={e=>setForm({...form,estimated_hours:e.target.value})}/></Field><Field label="Study hours / week"><input className="input" type="number" min=".25" step=".25" value={form.weekly_hours} onChange={e=>setForm({...form,weekly_hours:e.target.value})}/></Field></div>
    <Field label="Target completion date"><input className="input" type="date" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})}/></Field>
    <div style={{borderTop:'1px solid var(--border)',paddingTop:15,marginTop:4}}><div style={{fontSize:12,fontWeight:800,marginBottom:4}}>📚 Course curriculum</div><div style={{fontSize:11,color:'var(--text-3)',marginBottom:10}}>Add every lesson exactly as it appears in the course. Sections are grouped automatically.</div>
      {(form.modules||[]).map(m=><div key={m.id} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 10px',background:'var(--card-2)',borderRadius:9,marginBottom:6}}><span style={{fontSize:15}}>{TYPES.find(t=>t.value===m.type)?.label.split(' ')[0]||'📌'}</span><span style={{flex:1,fontSize:12}}><b>{m.section}</b> · {m.title}</span><span style={{fontSize:11,color:'var(--text-3)'}}>{m.minutes}m</span><button className="btn-icon" onClick={()=>setForm(f=>({...f,modules:f.modules.filter(x=>x.id!==m.id)}))}>✕</button></div>)}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}><input className="input" placeholder="Lesson / activity title" value={lesson.title} onChange={e=>setLesson({...lesson,title:e.target.value})}/><select className="input" value={lesson.type} onChange={e=>setLesson({...lesson,type:e.target.value})}>{TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 100px',gap:7,marginTop:7}}><input className="input" placeholder="Section name e.g. Introduction to Agents" value={lesson.section} onChange={e=>setLesson({...lesson,section:e.target.value})}/><input className="input" type="number" min="1" placeholder="mins" value={lesson.minutes} onChange={e=>setLesson({...lesson,minutes:e.target.value})}/></div>
      <input className="input" style={{marginTop:7}} placeholder="Lesson URL (optional)" value={lesson.url} onChange={e=>setLesson({...lesson,url:e.target.value})}/><button className="btn-ghost" style={{width:'100%',marginTop:7}} onClick={addLesson}>＋ Add lesson</button>
    </div><button className="btn-primary" style={{width:'100%',marginTop:18}} onClick={save}>Save Course</button>
  </div></div></div>}

  {selected&&!formOpen&&<CourseDetail course={selected} onClose={()=>setSelected(null)} onEdit={()=>{setFormOpen(true);setForm({...EMPTY,...selected,modules:normalizeModules(selected.modules)});setSelected(null)}} onToggle={toggleLesson} onSaveNotes={saveLessonNotes} onCertificate={uploadCertificate} savingCert={savingCert} openLesson={openLesson} setOpenLesson={setOpenLesson}/>}
  </Layout>;
}

function CourseCard({course,onOpen,onEdit,onDelete}){
  const d=daysLeft(course),p=progress(course),mods=course.modules||[],done=mods.filter(m=>m.completed).length,urgent=d!==null&&d<=7&&d>=0;
  return <div className="card" style={{padding:15,marginBottom:10,borderColor:urgent?'rgba(239,68,68,.45)':'var(--border)'}}><div style={{display:'flex',gap:12,alignItems:'flex-start'}}><div style={{width:44,height:44,borderRadius:12,background:'rgba(16,185,129,.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:23,flexShrink:0}}>🎓</div><div style={{flex:1,minWidth:0}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><div style={{fontWeight:800,fontSize:15}}>{course.title}</div><span style={{fontSize:11,color:course.status==='completed'?'var(--green)':urgent?'var(--red)':'var(--text-3)'}}>P{course.priority||3}</span></div><div style={{fontSize:11,color:'var(--text-3)',marginTop:3}}>{course.provider||'Self study'} · {mods.length?done+'/'+mods.length+' lessons':hoursLeft(course).toFixed(1)+'h remaining'}{d!==null?' · '+(d<0?'overdue':d+'d left'):''}</div><div style={{height:6,background:'var(--card-2)',borderRadius:8,overflow:'hidden',marginTop:10}}><div style={{height:'100%',width:p+'%',background:'var(--green)'}}/></div><div style={{display:'flex',gap:7,marginTop:10}}><button className="btn-ghost" style={{flex:1}} onClick={onOpen}>Open Course</button><button className="btn-ghost" onClick={onEdit}>Edit</button><button className="btn-icon" onClick={onDelete}>✕</button></div></div></div></div>;
}

function CourseDetail({course,onClose,onEdit,onToggle,onSaveNotes,onCertificate,savingCert,openLesson,setOpenLesson}){
  const mods=normalizeModules(course.modules),p=progress(course),d=daysLeft(course),groups=mods.reduce((a,m)=>{const k=m.section||'Course content';(a[k]||(a[k]=[])).push(m);return a},{});
  return <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}><div className="modal-sheet" style={{maxHeight:'94vh',overflowY:'auto'}}><div style={{width:36,height:4,background:'var(--border)',borderRadius:2,margin:'12px auto'}}/><div className="modal-header"><span style={{fontWeight:800}}>🎓 {course.title}</span><button className="btn-icon" onClick={onClose}>✕</button></div><div className="modal-body">
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}><span className="badge">{course.provider||'Self study'}</span><span className="badge">P{course.priority||3}</span>{d!==null&&<span className="badge">{d<0?'Overdue':d+'d left'}</span>}</div>
    {course.description&&<div style={{fontSize:13,color:'var(--text-2)',lineHeight:1.6,marginBottom:16}}>{course.description}</div>}
    <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text-3)',marginBottom:6}}><span>{mods.length?mods.filter(m=>m.completed).length+'/'+mods.length+' lessons':''} {p}% complete</span><span>{hoursLeft(course).toFixed(1)}h remaining</span></div><div style={{height:8,background:'var(--card-2)',borderRadius:10,overflow:'hidden',marginBottom:18}}><div style={{height:'100%',width:p+'%',background:'var(--green)'}}/></div>
    <div style={{fontSize:12,fontWeight:800,letterSpacing:1,textTransform:'uppercase',marginBottom:9}}>Curriculum</div>
    {Object.entries(groups).map(([section,items])=><div key={section} style={{marginBottom:16}}><div style={{fontWeight:800,fontSize:13,marginBottom:7,padding:'8px 10px',background:'var(--card-2)',borderRadius:9}}>§ {section}<span style={{float:'right',fontWeight:500,color:'var(--text-3)'}}>{items.filter(m=>m.completed).length}/{items.length}</span></div>{items.map(m=><div key={m.id} style={{border:'1px solid var(--border)',borderRadius:10,marginBottom:7,overflow:'hidden'}}><button onClick={()=>setOpenLesson(openLesson===m.id?null:m.id)} style={{width:'100%',border:0,background:'transparent',color:'var(--text)',padding:'11px 10px',display:'flex',gap:9,alignItems:'center',textAlign:'left',cursor:'pointer'}}><span>{m.completed?'✅':(TYPES.find(t=>t.value===m.type)?.label.split(' ')[0]||'📌')}</span><span style={{flex:1,fontSize:13}}>{m.title}</span><span style={{fontSize:11,color:'var(--text-3)'}}>{m.minutes}m</span><span style={{fontSize:12}}>{openLesson===m.id?'⌃':'⌄'}</span></button>{openLesson===m.id&&<div style={{padding:'0 10px 11px',borderTop:'1px solid var(--border)'}}><div style={{display:'flex',gap:7,marginTop:9}}><button className={`btn-${m.completed?'ghost':'primary'}`} style={{flex:1}} onClick={()=>onToggle(course,m.id)}>{m.completed?'↩ Mark incomplete':'✓ Mark complete'}</button>{m.url&&<a className="btn-ghost" href={m.url} target="_blank" rel="noreferrer" style={{textDecoration:'none'}}>Open ↗</a>}</div><label style={{display:'block',fontSize:11,color:'var(--text-3)',fontWeight:700,marginTop:10,marginBottom:5}}>LESSON NOTES</label><textarea className="input" rows={5} defaultValue={m.notes||''} onBlur={e=>onSaveNotes(course,m.id,e.target.value)} placeholder="Notes for this specific lesson..."/></div>}</div>)}</div>)}
    {!mods.length&&<div className="card-2" style={{padding:14,color:'var(--text-3)',fontSize:12}}>No curriculum added yet. Edit the course and add lessons with their real durations.</div>}
    <Field label="Course notes / overall notes"><textarea className="input" rows={5} defaultValue={course.notes||''} onBlur={e=>onSaveNotes(course,'__course__',e.target.value)} placeholder="Big-picture notes, projects, ideas and things to revisit..."/></Field>
    {course.url&&<a href={course.url} target="_blank" rel="noreferrer" className="btn-ghost" style={{display:'block',textAlign:'center',textDecoration:'none',marginBottom:10}}>🌐 Open Course</a>}
    <label className="btn-ghost" style={{display:'block',textAlign:'center',cursor:'pointer',marginBottom:10}}>{savingCert?'Processing…':course.certificate?'🏆 Certificate Stored':'📜 Add Course Certificate'}<input type="file" accept="image/*" style={{display:'none'}} disabled={savingCert} onChange={e=>onCertificate(e,course)}/></label>
    {course.certificate?.image&&<img src={course.certificate.image} alt="Course certificate" style={{width:'100%',borderRadius:10,border:'1px solid var(--border)'}}/>}
    <button className="btn-primary" style={{width:'100%',marginTop:5}} onClick={onEdit}>Edit Course</button>
  </div></div></div>;
}
