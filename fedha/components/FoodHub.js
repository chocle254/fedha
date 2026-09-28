import { useEffect, useMemo, useState } from 'react';
import { COMMON_FOODS, FOOD_GROUPS } from '../lib/foods';
import { getFoodProfile, saveFoodProfile, getFoodLogs, getSetting } from '../lib/db';
import { useFloatingCash } from '../lib/floating';
import { formatCurrency, genId, todayISO } from '../lib/utils';

const MEAL_IDEAS = [
  { id:'eggs_bread_milk', name:'Eggs + Bread + Milk', ids:['egg_boiled','bread','milk'], slot:'breakfast', tags:['protein','energy'] },
  { id:'oats_banana_pb', name:'Oatmeal + Banana + Peanut Butter', ids:['oatmeal','banana','peanutbutter'], slot:'breakfast', tags:['high-calorie','energy'] },
  { id:'ugali_beef_sukuma', name:'Ugali + Beef Stew + Sukuma Wiki', ids:['ugali','beef_stew','sukuma'], slot:'lunch', tags:['protein','balanced'] },
  { id:'rice_beans_avocado', name:'Rice + Beans + Avocado', ids:['rice','beans','avocado'], slot:'lunch', tags:['protein','budget'] },
  { id:'githeri_avocado', name:'Githeri + Avocado', ids:['githeri','avocado'], slot:'lunch', tags:['protein','Kenyan'] },
  { id:'ugali_omena_sukuma', name:'Ugali + Omena + Sukuma Wiki', ids:['ugali','omena','sukuma'], slot:'dinner', tags:['protein','Kenyan'] },
  { id:'banana_pb_milk', name:'Banana + Peanut Butter + Milk', ids:['banana','peanutbutter','milk'], slot:'snack', tags:['high-calorie','protein'] },
  { id:'eggs_chapati_milk', name:'Eggs + Chapati + Milk', ids:['egg_boiled','chapati','milk'], slot:'breakfast', tags:['high-calorie','protein'] },
];

const DEFAULT_PROFILE = { customFoods:[], preferences:{}, mealPreferences:{}, prices:{}, savedMeals:[] };

function pref(profile, id) {
  return profile.preferences?.[id] || { score:0, state:'neutral' };
}

export default function FoodHub({ onLogMeal }) {
  const { floating, currency } = useFloatingCash();
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [logs, setLogs] = useState([]);
  const [calGoal, setCalGoal] = useState(2800);
  const [proteinGoal, setProteinGoal] = useState(120);
  const [tab, setTab] = useState('explore');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [filter, setFilter] = useState('all');
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({name:'',serving:'1 serving',cal:'',protein:'',carbs:'',fats:'',price:'',group:'proteins'});
  const [selected, setSelected] = useState([]);
  
  async function load() {
    const [p,l,cg,pg] = await Promise.all([
      getFoodProfile(), getFoodLogs(), getSetting('calorie_goal',2800), getSetting('protein_goal',120)
    ]);
    setProfile({...DEFAULT_PROFILE,...p});
    setLogs(l);
    setCalGoal(Number(cg)||2800);
    setProteinGoal(Number(pg)||120);
  }
  useEffect(() => { load(); }, []);

  const foods = useMemo(() => [...COMMON_FOODS, ...(profile.customFoods || [])], [profile.customFoods]);
  const todayLogs = logs.filter(l => l.date === todayISO());
  const eatenCal = todayLogs.reduce((s,l) => s + Number(l.cal||0)*(l.qty||1),0);
  const eatenProtein = todayLogs.reduce((s,l) => s + Number(l.protein||0)*(l.qty||1),0);
  const remainingCal = Math.max(0, calGoal - eatenCal);
  const remainingProtein = Math.max(0, proteinGoal - eatenProtein);

  const filteredFoods = useMemo(() => {
    const q=query.trim().toLowerCase();
    return foods.filter(f => {
      const p=pref(profile,f.id);
      const search=!q || f.name.toLowerCase().includes(q) || (f.tags||[]).some(t=>t.toLowerCase().includes(q));
      const grp=group==='all' || f.group===group;
      const fl=filter==='all' ||
        (filter==='liked' && p.state==='liked') ||
        (filter==='high-protein' && Number(f.protein||0)>=15) ||
        (filter==='high-calorie' && Number(f.cal||0)>=250) ||
        (filter==='priced' && profile.prices?.[f.id] != null);
      return search && grp && fl;
    });
  },[foods,query,group,filter,profile]);

  const ideas = useMemo(() => {
    const map=Object.fromEntries(foods.map(f=>[f.id,f]));
    return MEAL_IDEAS.map(idea => {
      const items=idea.ids.map(id=>map[id]).filter(Boolean);
      if(items.length!==idea.ids.length) return null;
      const costValues=items.map(f=>profile.prices?.[f.id]);
      const costKnown=costValues.every(v=>v!=null && Number(v)>=0);
      const cost=costKnown ? costValues.reduce((s,v)=>s+Number(v),0) : null;
      const cal=items.reduce((s,f)=>s+Number(f.cal||0),0);
      const protein=items.reduce((s,f)=>s+Number(f.protein||0),0);
      const score=items.reduce((s,f)=>s+pref(profile,f.id).score,0);
      const fitsBalance=!costKnown || cost<=Math.max(0,floating);
      const fitsToday=cal<=remainingCal || protein<=remainingProtein;
      return {...idea,items,cost,costKnown,cal,protein,score,fitsBalance,fitsToday};
    }).filter(Boolean).filter(x=>x.fitsBalance);
  },[foods,profile,floating,remainingCal,remainingProtein]);

  const rankedIdeas=[...ideas].sort((a,b) => {
    const aNeed=(a.protein<=remainingProtein?1:0)+(a.cal<=remainingCal?1:0);
    const bNeed=(b.protein<=remainingProtein?1:0)+(b.cal<=remainingCal?1:0);
    return (b.score-a.score) || (bNeed-aNeed) || (b.protein-a.protein);
  });

  async function rate(id,state) {
    const old=pref(profile,id);
    const next={...profile,preferences:{...(profile.preferences||{}),[id]:{
      ...old,state,
      score:Math.max(-5,Math.min(5,old.score+(state==='liked'?1:-1))),
      updatedAt:new Date().toISOString()
    }}};
    setProfile(next);
    await saveFoodProfile(next);
  }

  async function setPrice(id,value) {
    const next={...profile,prices:{...(profile.prices||{}),[id]:value===''?null:Math.max(0,Number(value))}};
    setProfile(next);
    await saveFoodProfile(next);
  }

  async function rateMeal(id, state) {
    const old=profile.mealPreferences?.[id] || {score:0,state:'neutral'};
    const next={...profile,mealPreferences:{...(profile.mealPreferences||{}),[id]:{
      ...old,
      state,
      score:Math.max(-5,Math.min(5,old.score+(state==='liked'?1:-1))),
      updatedAt:new Date().toISOString()
    }}};
    setProfile(next);
    await saveFoodProfile(next);
  }

  async function addCustom() {
    if(!custom.name.trim() || !Number(custom.cal)) return;
    const food={
      id:'custom_'+genId(), name:custom.name.trim(), serving:custom.serving||'1 serving',
      cal:Number(custom.cal), protein:Number(custom.protein)||0,
      carbs:custom.carbs===''?null:Number(custom.carbs), fats:custom.fats===''?null:Number(custom.fats),
      group:custom.group, icon:'🍽️', custom:true, tags:['custom']
    };
    const next={...profile,customFoods:[...(profile.customFoods||[]),food]};
    if(custom.price!=='') next.prices={...(next.prices||{}),[food.id]:Number(custom.price)};
    setProfile(next);
    await saveFoodProfile(next);
    setCustom({name:'',serving:'1 serving',cal:'',protein:'',carbs:'',fats:'',price:'',group:'proteins'});
    setCustomOpen(false);
  }

  function logItems(items,slot) {
    if(onLogMeal) onLogMeal({items,slot:slot||'lunch',name:items.map(f=>f.name).join(' + ')});
  }

  async function saveMeal() {
    const items=selected.map(id=>foods.find(f=>f.id===id)).filter(Boolean);
    if(!items.length) return;
    const meal={id:'meal_'+genId(),name:items.map(f=>f.name.split(' (')[0]).join(' + '),items,cal:items.reduce((s,f)=>s+Number(f.cal||0),0),protein:items.reduce((s,f)=>s+Number(f.protein||0),0),createdAt:new Date().toISOString()};
    const next={...profile,savedMeals:[...(profile.savedMeals||[]),meal]};
    setProfile(next); await saveFoodProfile(next);
  }

  return <div>
    <div style={{display:'flex',gap:8,overflowX:'auto',marginBottom:14}}>
      <button className={'chip '+(tab==='explore'?'active':'')} onClick={()=>setTab('explore')}>Explore</button>
      <button className={'chip '+(tab==='suggestions'?'active':'')} onClick={()=>setTab('suggestions')}>Meal ideas</button>
      <button className={'chip '+(tab==='build'?'active':'')} onClick={()=>setTab('build')}>Build</button>
      <button className={'chip '+(tab==='insights'?'active':'')} onClick={()=>setTab('insights')}>Insights</button>
    </div>

    {tab==='explore' && <div>
      <div className="card" style={{padding:16,marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12}}>
          <div><div style={{fontSize:11,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:1}}>Floating Balance</div><div className="font-num" style={{fontSize:22,fontWeight:700,color:floating>=0?'var(--green)':'var(--red)'}}>{formatCurrency(Math.max(0,floating),currency)}</div></div>
          <div style={{fontSize:12,color:'var(--text-3)',textAlign:'right'}}>Today: {Math.round(remainingCal)} cal · {Math.round(remainingProtein)}g protein remaining</div>
        </div>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:10}}>
        <input className="input" style={{flex:1}} placeholder="Search foods..." value={query} onChange={e=>setQuery(e.target.value)}/>
        <button className="btn-primary" onClick={()=>setCustomOpen(true)} style={{padding:'10px 12px'}}>+ Food</button>
      </div>
      <div style={{display:'flex',gap:7,overflowX:'auto',paddingBottom:8}}>
        <button className={'chip '+(group==='all'?'active':'')} onClick={()=>setGroup('all')}>All</button>
        {FOOD_GROUPS.map(g=><button key={g.id} className={'chip '+(group===g.id?'active':'')} onClick={()=>setGroup(g.id)}>{g.label}</button>)}
      </div>
      <div style={{display:'flex',gap:7,overflowX:'auto',paddingBottom:14}}>
        {[
          ['all','All'],['liked','Liked'],['high-protein','High protein'],['high-calorie','High calorie'],['priced','Priced']
        ].map(x=><button key={x[0]} className={'chip '+(filter===x[0]?'active':'')} onClick={()=>setFilter(x[0])}>{x[1]}</button>)}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:9}}>
        {filteredFoods.map(f=>{
          const p=pref(profile,f.id); const price=profile.prices?.[f.id];
          return <div key={f.id} className="card" style={{padding:13}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:23}}>{f.icon}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:700}}>{f.name}</div><div style={{fontSize:11,color:'var(--text-3)',marginTop:3}}>{f.serving||'1 serving'} · {f.cal} cal · {f.protein}g protein{f.carbs!=null?' · '+f.carbs+'g carbs':''}{f.fats!=null?' · '+f.fats+'g fat':''}</div></div>
              {p.state==='liked' && <span>❤️</span>}{p.state==='disliked' && <span>👎</span>}
            </div>
            <div style={{display:'flex',gap:7,alignItems:'center',marginTop:10,flexWrap:'wrap'}}>
              <button className="btn-ghost" style={{padding:'6px 9px'}} onClick={()=>rate(f.id,'liked')}>❤️ Like</button>
              <button className="btn-ghost" style={{padding:'6px 9px'}} onClick={()=>rate(f.id,'disliked')}>👎 Dislike</button>
              <button className="btn-ghost" style={{padding:'6px 9px'}} onClick={()=>logItems([f])}>+ Log</button>
              {price!=null && <span className="font-num" style={{fontSize:12,color:'var(--green)',marginLeft:'auto'}}>{formatCurrency(price,currency)}</span>}
              <input className="input font-num" style={{width:80,padding:'5px 7px'}} type="number" min="0" placeholder="Price" value={price==null?'':price} onChange={e=>setPrice(f.id,e.target.value)}/>
            </div>
          </div>
        })}
      </div>
    </div>}

    {tab==='suggestions' && <div>
      <div className="card" style={{padding:15,marginBottom:14}}>
        <div className="section-title" style={{marginBottom:7}}>PERSONALIZED MEAL IDEAS</div>
        <div style={{fontSize:12,color:'var(--text-3)'}}>Fedha uses your preferences, today's nutrition gap and the existing Floating Balance. Prices are your own local prices.</div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {rankedIdeas.map(idea=><div key={idea.id} className="card" style={{padding:15}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:10}}><div><div style={{fontSize:15,fontWeight:700}}>{idea.name}</div><div style={{fontSize:12,color:'var(--text-3)',marginTop:3}}>{idea.cal} cal · {idea.protein}g protein · {idea.slot}</div></div><div style={{display:'flex',gap:5}}>
            <button className="btn-ghost" style={{padding:'5px 8px'}} onClick={()=>rateMeal(idea.id,'liked')}>❤️</button>
            <button className="btn-ghost" style={{padding:'5px 8px'}} onClick={()=>rateMeal(idea.id,'disliked')}>👎</button>
          </div></div>
          <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:10}}>{idea.tags.map(t=><span key={t} className="chip">{t}</span>)}{idea.costKnown?<span className="chip" style={{color:'var(--green)'}}>💰 {formatCurrency(idea.cost,currency)}</span>:<span className="chip">Price not set</span>}{idea.costKnown&&idea.cost<=Math.max(0,floating)&&<span className="chip" style={{color:'var(--green)'}}>✓ Fits Floating Balance</span>}</div>
          <button className="btn-primary" style={{width:'100%',marginTop:12}} onClick={()=>logItems(idea.items,idea.slot)}>Log this meal</button>
        </div>)}
        {!rankedIdeas.length && <div className="empty-state"><div className="icon">💰</div><h3>No meal ideas fit right now</h3><p>Set prices for foods you use so Fedha can apply your Floating Balance.</p></div>}
      </div>
    </div>}

    {tab==='build' && <div>
      <div className="card" style={{padding:15,marginBottom:14}}>
        <div className="section-title" style={{marginBottom:8}}>MEAL BUILDER</div>
        <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
          <span className="chip">🔥 {selected.reduce((s,id)=>s+Number((foods.find(f=>f.id===id)||{}).cal||0),0)} cal</span>
          <span className="chip">💪 {selected.reduce((s,id)=>s+Number((foods.find(f=>f.id===id)||{}).protein||0),0)}g protein</span>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {foods.map(f=><button key={f.id} onClick={()=>setSelected(s=>s.includes(f.id)?s.filter(x=>x!==f.id):[...s,f.id])} className="card" style={{padding:'11px 13px',display:'flex',alignItems:'center',gap:10,textAlign:'left',border:selected.includes(f.id)?'1px solid var(--green)':'1px solid var(--border)',background:selected.includes(f.id)?'var(--green-dim)':'var(--card)'}}><span style={{fontSize:21}}>{f.icon}</span><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{f.name}</div><div style={{fontSize:11,color:'var(--text-3)'}}>{f.cal} cal · {f.protein}g protein</div></div><span>{selected.includes(f.id)?'✓':'+'}</span></button>)}
      </div>
      <div style={{display:'flex',gap:8,marginTop:14}}><button className="btn-primary" disabled={!selected.length} style={{flex:1}} onClick={()=>logItems(selected.map(id=>foods.find(f=>f.id===id)).filter(Boolean))}>Log meal</button><button className="btn-ghost" disabled={!selected.length} onClick={saveMeal}>Save meal</button></div>
      {(profile.savedMeals||[]).length>0 && <div style={{marginTop:22}}><div className="section-title" style={{marginBottom:9}}>SAVED MEALS</div>{profile.savedMeals.map(m=><div key={m.id} className="card" style={{padding:12,display:'flex',gap:10,alignItems:'center',marginBottom:8}}><div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>{m.name}</div><div style={{fontSize:11,color:'var(--text-3)'}}>{m.cal} cal · {m.protein}g protein</div></div><button className="btn-ghost" onClick={()=>logItems(m.items)}>Log</button></div>)}</div>}
    </div>}

    {tab==='insights' && <div>
      <div className="card" style={{padding:15,marginBottom:12}}>
        <div className="section-title" style={{marginBottom:12}}>NUTRITION INSIGHTS</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
          {[
            ['Avg calories',Math.round((logs.reduce((s,l)=>s+Number(l.cal||0)*(l.qty||1),0)/(new Set(logs.map(l=>l.date)).size||1))), 'kcal/day'],
            ['Avg protein',Math.round((logs.reduce((s,l)=>s+Number(l.protein||0)*(l.qty||1),0)/(new Set(logs.map(l=>l.date)).size||1)))+'g','per logged day'],
            ['Days logged',new Set(logs.map(l=>l.date)).size,'days'],
            ['Meals logged',logs.length,'entries']
          ].map(x=><div key={x[0]} className="card-2" style={{padding:12}}><div style={{fontSize:11,color:'var(--text-3)'}}>{x[0]}</div><div className="font-num" style={{fontSize:20,fontWeight:700,marginTop:4}}>{x[1]}</div><div style={{fontSize:10,color:'var(--text-3)'}}>{x[2]}</div></div>)}
        </div>
      </div>
      <div className="card" style={{padding:15}}>
        <div className="section-title" style={{marginBottom:10}}>YOUR PREFERENCES</div>
        {[...foods].filter(f=>pref(profile,f.id).score!==0).sort((a,b)=>pref(profile,b.id).score-pref(profile,a.id).score).map(f=><div key={f.id} style={{display:'flex',alignItems:'center',gap:9,padding:'8px 0',borderBottom:'1px solid var(--border)'}}><span>{f.icon}</span><span style={{flex:1,fontSize:13}}>{f.name}</span><span>{pref(profile,f.id).state==='liked'?'❤️':'👎'}</span></div>)}
        {Object.entries(profile.mealPreferences||{}).filter(x=>x[1].score!==0).sort((a,b)=>b[1].score-a[1].score).map(([id,p])=>{
          const idea=MEAL_IDEAS.find(x=>x.id===id);
          return idea ? <div key={id} style={{display:'flex',alignItems:'center',gap:9,padding:'8px 0',borderBottom:'1px solid var(--border)'}}><span>🍽️</span><span style={{flex:1,fontSize:13}}>{idea.name}</span><span>{p.state==='liked'?'❤️':'👎'}</span></div> : null;
        })}
        {!foods.some(f=>pref(profile,f.id).score!==0)&&<div style={{fontSize:13,color:'var(--text-3)'}}>Like or dislike foods in Explore and Fedha will learn your personal preferences.</div>}
      </div>
    </div>}

    {customOpen && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setCustomOpen(false)}>
      <div className="modal-sheet"><div className="modal-header"><h2 style={{fontSize:18}}>Add Custom Food</h2><button className="btn-icon" onClick={()=>setCustomOpen(false)}>✕</button></div>
        <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:11}}>
          <input className="input" placeholder="Food name" value={custom.name} onChange={e=>setCustom({...custom,name:e.target.value})}/>
          <input className="input" placeholder="Serving size" value={custom.serving} onChange={e=>setCustom({...custom,serving:e.target.value})}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}><input className="input" type="number" placeholder="Calories" value={custom.cal} onChange={e=>setCustom({...custom,cal:e.target.value})}/><input className="input" type="number" placeholder="Protein (g)" value={custom.protein} onChange={e=>setCustom({...custom,protein:e.target.value})}/><input className="input" type="number" placeholder="Carbs (g)" value={custom.carbs} onChange={e=>setCustom({...custom,carbs:e.target.value})}/><input className="input" type="number" placeholder="Fat (g)" value={custom.fats} onChange={e=>setCustom({...custom,fats:e.target.value})}/><input className="input" type="number" placeholder="Price / serving" value={custom.price} onChange={e=>setCustom({...custom,price:e.target.value})}/></div>
          <button className="btn-primary" disabled={!custom.name.trim()||!custom.cal} onClick={addCustom}>Save food</button>
        </div>
      </div>
    </div>}
  </div>;
}
