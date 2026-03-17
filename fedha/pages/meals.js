import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { useApp } from '../context/AppContext';
import { formatShort, formatCurrency } from '../lib/utils';
import { getSetting, setSetting } from '../lib/db';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// ─── ALL MEAL OPTIONS PER SLOT ────────────────────────────────────────────────
const MEAL_OPTIONS = {
  breakfast: [
    { name:'Uji wa Wimbi + 2 Boiled Eggs', cost:35, cal:520, protein:'22g', ingredients:'Millet flour, milk, 2 eggs', tip:'Add peanut butter to your uji for 100 extra calories' },
    { name:'Mandazi + Peanut Butter + Chai', cost:40, cal:580, protein:'14g', ingredients:'Mandazi, peanut butter, tea, milk, sugar', tip:'Spread peanut butter generously — do not be shy' },
    { name:'Mahamri + Chai ya Maziwa', cost:40, cal:560, protein:'10g', ingredients:'Mahamri, full milk tea, sugar', tip:'Full milk chai has protein and fat — better than weak tea' },
    { name:'Uji + Peanut Butter + Eggs', cost:45, cal:680, protein:'30g', ingredients:'Millet flour, milk, peanut butter, 2 eggs', tip:'This breakfast gives you enough protein for 3 hours of focus' },
    { name:'Sweet Potato + Scrambled Eggs', cost:50, cal:620, protein:'19g', ingredients:'3 sweet potatoes, 3 eggs, onions, tomatoes, oil', tip:'Sweet potato gives slow-release energy that lasts all morning' },
    { name:'Rice Porridge + Milk + Egg', cost:45, cal:640, protein:'24g', ingredients:'Leftover rice, milk, sugar, peanut butter, egg', tip:'Simmer rice in milk for a high-calorie creamy porridge' },
    { name:'Chapati + Scrambled Eggs + Chai', cost:65, cal:780, protein:'28g', ingredients:'3 chapati, 3 eggs, milk tea', tip:'Saturday-style breakfast any day — cook chapati with extra oil' },
    { name:'Oatmeal + Milk + Peanut Butter + Egg', cost:80, cal:820, protein:'34g', ingredients:'Oats, full milk, peanut butter, 2 fried eggs, banana', tip:'Oats keep you full for 4 hours — gym-quality breakfast' },
    { name:'French Toast + Chai', cost:55, cal:680, protein:'24g', ingredients:'4 bread slices, 3 eggs, milk, sugar, tea', tip:'Dip bread in egg+milk mixture before frying — tastes amazing' },
    { name:'Githeri ya Asubuhi + Egg', cost:50, cal:700, protein:'28g', ingredients:'Githeri, 2 fried eggs, onions, tomatoes', tip:'Leftover githeri refried with egg is one of the best breakfasts' },
    { name:'Ugali Kachumbari + Boiled Eggs', cost:45, cal:600, protein:'20g', ingredients:'Ugali, 3 boiled eggs, tomato, onion, lemon', tip:'Cold ugali from last night with fresh kachumbari is underrated' },
    { name:'Pancakes + Eggs + Banana', cost:70, cal:800, protein:'28g', ingredients:'Flour, eggs, milk, banana, honey', tip:'Add an egg to pancake batter — doubles protein without changing taste' },
  ],
  snack: [
    { name:'Banana + Groundnuts', cost:20, cal:280, protein:'7g', ingredients:'2 bananas, handful roasted groundnuts', tip:'Fast energy from banana + slow-burn protein from groundnuts' },
    { name:'2 Boiled Eggs + Banana', cost:30, cal:300, protein:'14g', ingredients:'2 eggs, 1 banana', tip:'Eggs are the fastest usable protein. Banana prevents muscle cramps' },
    { name:'Boiled Groundnuts', cost:15, cal:320, protein:'14g', ingredients:'Cup of groundnuts, salt, water', tip:'Boiling keeps more nutrients intact than roasting' },
    { name:'Avocado on Bread', cost:30, cal:340, protein:'6g', ingredients:'2 bread slices, 1 ripe avocado, salt', tip:'Avocado fat helps your body absorb all the vitamins from meals' },
    { name:'Sweet Potatoes + Glass of Milk', cost:30, cal:360, protein:'9g', ingredients:'2 boiled sweet potatoes, 1 glass milk', tip:'Best combo for sustained energy and calcium' },
    { name:'Peanut Butter Bread + Milk', cost:35, cal:520, protein:'16g', ingredients:'2 thick slices bread, peanut butter, 1 glass cold milk', tip:'500+ calories in 5 minutes — best easy weight gain combo' },
    { name:'Yogurt + Banana + Groundnuts', cost:55, cal:420, protein:'14g', ingredients:'1 cup yogurt, 2 bananas, groundnuts', tip:'Yogurt has live cultures that improve nutrient absorption' },
    { name:'Mandazi + Milk', cost:30, cal:380, protein:'8g', ingredients:'2 mandazi, 1 glass cold milk', tip:'Dip mandazi in milk — childhood classic that actually works' },
    { name:'Banana Peanut Butter Smoothie', cost:55, cal:580, protein:'16g', ingredients:'2 bananas, 3 tbsp PB, 1 cup milk', tip:'Homemade weight gainer shake — same as gym supplements at 10x less cost' },
    { name:'Boiled Arrow Roots (Nduma)', cost:25, cal:300, protein:'4g', ingredients:'2 arrow roots, salt', tip:'Nduma is filling, cheap and keeps you energised for hours' },
    { name:'3 Boiled Eggs', cost:25, cal:240, protein:'18g', ingredients:'3 eggs, salt, pepper', tip:'Pre-boil a week of eggs on Sunday — easiest protein snack ever' },
    { name:'Fruit Salad + Groundnuts', cost:40, cal:350, protein:'8g', ingredients:'Banana, mango, pawpaw, groundnuts', tip:'Vitamin C from fruit helps absorb iron from your other meals' },
  ],
  lunch: [
    { name:'Ugali + Beans + Sukuma Wiki', cost:60, cal:780, protein:'28g', ingredients:'Maize flour, dry beans, sukuma wiki, tomatoes, onions', tip:'Cook beans with a full onion and 2 tomatoes. Big ugali portion' },
    { name:'Ugali + Chicken Liver + Cabbage', cost:70, cal:820, protein:'38g', ingredients:'Chicken liver, ugali, cabbage, onions, oil, spices', tip:'Liver is the most nutritious cheap food — iron, B12, protein all in one' },
    { name:'Rice + Omena Stew + Sukuma', cost:65, cal:780, protein:'36g', ingredients:'Rice, omena, tomatoes, onions, oil, sukuma', tip:'Omena is the most protein-dense cheap food in Kenya. Fry it crispy' },
    { name:'Ugali + Beef Offcuts Stew', cost:90, cal:880, protein:'42g', ingredients:'Beef offcuts, ugali, tomatoes, onions, hoho', tip:'Offcuts from the butcher are cheap and very high in protein' },
    { name:'Pilau + Side Beans', cost:80, cal:820, protein:'28g', ingredients:'Rice, pilau masala, onions, oil, beans', tip:'Make pilau with the bean water for extra flavor and nutrition' },
    { name:'Ugali + Tilapia + Sukuma', cost:90, cal:760, protein:'40g', ingredients:'Small tilapia, ugali, sukuma wiki, lemon', tip:'Fish twice a week speeds up muscle building significantly' },
    { name:'Githeri + Potatoes', cost:50, cal:700, protein:'22g', ingredients:'Maize, beans, potatoes, carrots, onions', tip:'Githeri is a complete protein — body uses it as well as meat' },
    { name:'Rice + Beef Stew + Kachumbari', cost:160, cal:980, protein:'52g', ingredients:'Rice, beef, tomatoes, onions, hoho, avocado, lemon', tip:'Eat a large plate. This is your main muscle-building meal' },
    { name:'Ugali + Chicken Thighs + Cabbage', cost:160, cal:1020, protein:'56g', ingredients:'Chicken thighs, ugali, cabbage, carrots, lemon dressing', tip:'Thighs have more fat and flavor than breast — and cost less' },
    { name:'Ndengu Stew + Ugali + Sukuma', cost:55, cal:720, protein:'30g', ingredients:'Green grams, ugali, sukuma, tomatoes, coconut milk', tip:'Ndengu in coconut milk is incredibly tasty and very high protein' },
    { name:'Githeri + Beef + Avocado', cost:150, cal:980, protein:'46g', ingredients:'Githeri, beef chunks, avocado, tomato, onion, lemon', tip:'Githeri with beef is arguably the most complete Kenyan meal' },
    { name:'Ugali + Fried Eggs + Beans', cost:60, cal:740, protein:'32g', ingredients:'Ugali, 3 fried eggs, beans, tomatoes, onions', tip:'Simple but powerful. Egg + beans is a complete protein combination' },
  ],
  dinner: [
    { name:'Ugali + Beans + Fried Egg', cost:55, cal:720, protein:'30g', ingredients:'Maize flour, beans, 2 eggs, oil', tip:'Drink a glass of milk before bed for overnight muscle repair' },
    { name:'Sweet Potato + Scrambled Eggs', cost:55, cal:650, protein:'19g', ingredients:'3 sweet potatoes, 3 eggs, onions, tomatoes, oil', tip:'Sweet potato before bed gives slow-release carbs for muscle recovery' },
    { name:'Mukimo + Egg', cost:50, cal:650, protein:'22g', ingredients:'Sweet potato, peas, spinach, egg', tip:'Mukimo packs carbs and greens together — very efficient meal' },
    { name:'Githeri ya Usiku', cost:45, cal:700, protein:'22g', ingredients:'Maize, beans, potatoes, carrots, onions', tip:'Githeri is a complete protein. Your body loves it before sleep' },
    { name:'Rice + Beans + Avocado', cost:70, cal:740, protein:'26g', ingredients:'Rice, beans, avocado, salt, lemon', tip:'Avocado fat helps absorb all vitamins from the beans' },
    { name:'Ugali + Omena + Sukuma', cost:60, cal:720, protein:'38g', ingredients:'Ugali, omena, sukuma, oil, spices', tip:'Omena + sukuma is a Kenyan superfood combo — make it crispy' },
    { name:'Spaghetti + Beef + Tomato Sauce', cost:100, cal:840, protein:'38g', ingredients:'Pasta, beef mince, tomatoes, garlic, onions, spices', tip:'Cook the sauce long and slow. Add hoho for sweetness' },
    { name:'Ugali + Tilapia + Avocado', cost:110, cal:820, protein:'44g', ingredients:'Ugali, tilapia, avocado, sukuma, lemon', tip:'Fish for dinner means your muscles recover faster overnight' },
    { name:'Beans + Rice + Kachumbari', cost:65, cal:760, protein:'26g', ingredients:'Rice, beans, tomato, onion, chili, lemon', tip:'Fresh kachumbari lifts the whole dish — make it sharp and spicy' },
    { name:'Mukimo ya Ngwaci + Beef', cost:100, cal:820, protein:'38g', ingredients:'Sweet potato, peas, spinach, beef, kachumbari', tip:'Mukimo + meat is one of the most balanced Kenyan meals' },
    { name:'Chapati + Beans + Egg', cost:70, cal:760, protein:'28g', ingredients:'Chapati, beans, 2 fried eggs, avocado', tip:'Wrap the beans and egg in the chapati for the ultimate roll' },
    { name:'Fried Rice + Chicken Liver', cost:100, cal:840, protein:'42g', ingredients:'Rice, chicken liver, mixed veg, eggs, oil, spices', tip:'Liver gives you iron which carries oxygen to muscles' },
  ],
};

// Pick a random item from array, excluding current one
function pickRandom(arr, excludeName = null) {
  const options = excludeName ? arr.filter(m => m.name !== excludeName) : arr;
  return options[Math.floor(Math.random() * options.length)];
}

// Generate a full week plan
function generateWeek(currentPlan = null) {
  return DAYS.map((day, i) => {
    const existing = currentPlan?.[i];
    return {
      day,
      breakfast:  pickRandom(MEAL_OPTIONS.breakfast,  existing?.breakfast?.name),
      snack:      pickRandom(MEAL_OPTIONS.snack,       existing?.snack?.name),
      lunch:      pickRandom(MEAL_OPTIONS.lunch,       existing?.lunch?.name),
      dinner:     pickRandom(MEAL_OPTIONS.dinner,      existing?.dinner?.name),
    };
  });
}

const SLOT_COLORS = {
  breakfast: '#F59E0B',
  snack:     '#10B981',
  lunch:     '#3B82F6',
  dinner:    '#8B5CF6',
};

const SLOT_LABELS = {
  breakfast: '🌅 Breakfast',
  snack:     '🍌 10am Snack',
  lunch:     '🍲 Lunch',
  dinner:    '🌙 Dinner',
};

export default function MealsPage() {
  const { wallets, budgets, loans, currency } = useApp();
  const [weekPlan, setWeekPlan] = useState(null);
  const [activeDay, setActiveDay] = useState(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
  const [showTxn, setShowTxn] = useState(false);
  const [refreshing, setRefreshing] = useState(null); // 'week' | 'breakfast' etc

  // Floating cash
  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance || 0), 0);
  const totalBudgeted = budgets.reduce((s, b) => s + Math.max(0, Number(b.allocated || 0) - Number(b.spent || 0)), 0);
  const totalOwed = loans.filter(l => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount || 0), 0);
  const floating = Math.max(0, totalBalance - totalBudgeted - totalOwed);
  const dailyFoodBudget = Math.min(1200, floating * 0.15);
  const tier = dailyFoodBudget >= 700 ? 'good' : dailyFoodBudget >= 300 ? 'comfortable' : 'tight';
  const tierInfo = {
    tight:       { label:'Budget Mode', color:'#F59E0B', range:'Under KSh 200/day' },
    comfortable: { label:'Comfortable', color:'#3B82F6', range:'KSh 300–600/day' },
    good:        { label:'Eating Well', color:'#10B981', range:'KSh 700+/day' },
  }[tier];

  // Load saved plan from IndexedDB
  useEffect(() => {
    async function load() {
      const saved = await getSetting('meal_week_plan', null);
      if (saved) {
        setWeekPlan(saved);
      } else {
        const fresh = generateWeek();
        setWeekPlan(fresh);
        await setSetting('meal_week_plan', fresh);
      }
    }
    load();
  }, []);

  async function refreshWeek() {
    setRefreshing('week');
    await new Promise(r => setTimeout(r, 400));
    const fresh = generateWeek(weekPlan);
    setWeekPlan(fresh);
    await setSetting('meal_week_plan', fresh);
    setRefreshing(null);
  }

  async function refreshMeal(dayIdx, slot) {
    setRefreshing(`${dayIdx}_${slot}`);
    await new Promise(r => setTimeout(r, 300));
    const current = weekPlan[dayIdx][slot].name;
    const newMeal = pickRandom(MEAL_OPTIONS[slot], current);
    const updated = weekPlan.map((d, i) => i === dayIdx ? { ...d, [slot]: newMeal } : d);
    setWeekPlan(updated);
    await setSetting('meal_week_plan', updated);
    setRefreshing(null);
  }

  if (!weekPlan) {
    return (
      <Layout onFab={() => setShowTxn(true)}>
        <div style={{ padding:'80px 20px', display:'flex', flexDirection:'column', gap:16 }}>
          {[...Array(4)].map((_,i) => <div key={i} className="skeleton" style={{ height:80, borderRadius:16 }} />)}
        </div>
      </Layout>
    );
  }

  const today = weekPlan[activeDay];
  const todayCost = today.breakfast.cost + today.snack.cost + today.lunch.cost + today.dinner.cost;
  const todayCal = today.breakfast.cal + today.snack.cal + today.lunch.cal + today.dinner.cal;
  const todayProtein = parseInt(today.breakfast.protein) + parseInt(today.snack.protein) + parseInt(today.lunch.protein) + parseInt(today.dinner.protein);
  const canAfford = floating >= todayCost;

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        <div className="page-header">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
            <h1 style={{ fontSize:22, fontWeight:700 }}>Meal Planner 🍽️</h1>
            <button
              onClick={refreshWeek}
              disabled={refreshing === 'week'}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', background:'var(--card-2)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text-2)', fontSize:13, cursor:'pointer', fontFamily:'Outfit', fontWeight:500 }}>
              <span style={{ display:'inline-block', animation: refreshing==='week' ? 'spin 0.6s linear infinite' : 'none' }}>🔄</span>
              {refreshing === 'week' ? 'Refreshing…' : 'New Week'}
            </button>
          </div>
          <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:14 }}>
            Based on your {formatShort(floating, currency)} floating cash
          </div>

          {/* Tier badge */}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:`${tierInfo.color}12`, border:`1px solid ${tierInfo.color}30`, borderRadius:10, marginBottom:14 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:tierInfo.color, flexShrink:0 }} />
            <div style={{ fontSize:13, fontWeight:600, color:tierInfo.color }}>{tierInfo.label} — {tierInfo.range}</div>
          </div>

          {/* Day selector */}
          <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
            {DAYS.map((d, i) => (
              <button key={d} className={`chip ${activeDay===i ? 'active' : ''}`} onClick={() => setActiveDay(i)} style={{ flexShrink:0 }}>
                {d.slice(0,3)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding:'0 20px' }}>
          {/* Daily summary */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginBottom:16 }}>
            {[
              { label:'Calories', value:`${todayCal.toLocaleString()}`, unit:'kcal', color:'#F59E0B' },
              { label:'Protein', value:`~${todayProtein}g`, unit:'', color:'#3B82F6' },
              { label:'Cost', value:`KSh ${todayCost}`, unit:'', color: canAfford ? '#10B981' : '#EF4444' },
            ].map(s => (
              <div key={s.label} className="card-2" style={{ padding:'10px 12px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:'var(--text-3)', fontWeight:600, letterSpacing:0.5, textTransform:'uppercase', marginBottom:4 }}>{s.label}</div>
                <div className="font-num" style={{ fontSize:14, fontWeight:700, color:s.color }}>{s.value}</div>
                {s.unit && <div style={{ fontSize:10, color:'var(--text-3)' }}>{s.unit}</div>}
              </div>
            ))}
          </div>

          {/* Afford banner */}
          <div style={{ padding:'10px 14px', background: canAfford ? 'var(--green-dim)' : 'var(--red-dim)', border:`1px solid ${canAfford ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius:10, fontSize:13, marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ color:'var(--text-2)' }}>{canAfford ? '✓ You can afford today' : '⚠ Tight on today\'s meals'}</span>
            <span className="font-num" style={{ fontWeight:700, color: canAfford ? 'var(--green)' : 'var(--red)' }}>
              KSh {todayCost} / KSh {Math.round(dailyFoodBudget)}
            </span>
          </div>

          {/* Meal cards */}
          <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:24 }}>
            {(['breakfast','snack','lunch','dinner']).map(slot => {
              const meal = today[slot];
              const color = SLOT_COLORS[slot];
              const isRefreshing = refreshing === `${activeDay}_${slot}`;
              return (
                <div key={slot} className="card" style={{ padding:'14px 16px', borderLeft:`3px solid ${color}`, opacity: isRefreshing ? 0.5 : 1, transition:'opacity 0.3s' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, color:color, fontWeight:600, letterSpacing:0.8, textTransform:'uppercase', marginBottom:3 }}>{SLOT_LABELS[slot]}</div>
                      <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:2, paddingRight:8 }}>{meal.name}</div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                      <div className="font-num" style={{ fontSize:14, fontWeight:700, color:'var(--green)' }}>KSh {meal.cost}</div>
                      <button
                        onClick={() => refreshMeal(activeDay, slot)}
                        disabled={!!refreshing}
                        style={{ background:'var(--card-2)', border:'1px solid var(--border)', borderRadius:8, padding:'4px 10px', fontSize:12, color:'var(--text-3)', cursor:'pointer', fontFamily:'Outfit', display:'flex', alignItems:'center', gap:4 }}>
                        <span style={{ display:'inline-block', animation: isRefreshing ? 'spin 0.5s linear infinite' : 'none', fontSize:11 }}>🔄</span>
                        swap
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:6 }}>
                    <span style={{ color:'var(--text-2)' }}>Ingredients: </span>{meal.ingredients}
                  </div>
                  <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                    <span style={{ background:`${color}15`, border:`1px solid ${color}30`, color:color, fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:100 }}>{meal.cal} cal</span>
                    <span style={{ background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.2)', color:'#93C5FD', fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:100 }}>{meal.protein} protein</span>
                  </div>
                  <div style={{ background:'var(--card-2)', borderRadius:8, padding:'8px 10px', fontSize:12, color:'var(--text-2)', lineHeight:1.5, display:'flex', gap:6 }}>
                    <span style={{ color:color, flexShrink:0 }}>💡</span>
                    <span>{meal.tip}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Weekly overview */}
          <div style={{ marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div className="section-title" style={{ marginBottom:0 }}>WEEK OVERVIEW</div>
              <div style={{ fontSize:12, color:'var(--text-3)' }}>Tap day to view</div>
            </div>
            <div className="card" style={{ overflow:'hidden' }}>
              {weekPlan.map((d, i) => {
                const dayCost = d.breakfast.cost + d.snack.cost + d.lunch.cost + d.dinner.cost;
                const dayCal = d.breakfast.cal + d.snack.cal + d.lunch.cal + d.dinner.cal;
                const isActive = i === activeDay;
                return (
                  <div key={d.day} onClick={() => setActiveDay(i)}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderBottom: i < 6 ? '1px solid var(--border)' : 'none', background: isActive ? 'var(--green-dim)' : 'transparent', cursor:'pointer' }}>
                    <div style={{ width:32, fontSize:13, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--green)' : 'var(--text-2)', flexShrink:0 }}>{d.day.slice(0,3)}</div>
                    <div style={{ flex:1, fontSize:12, color:'var(--text-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {d.breakfast.name.split(' + ')[0]} · {d.lunch.name.split(' + ')[0]} · {d.dinner.name.split(' + ')[0]}
                    </div>
                    <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                      <span className="font-num" style={{ fontSize:12, color: isActive ? 'var(--green)' : 'var(--text-3)', fontWeight: isActive ? 700 : 400 }}>KSh {dayCost}</span>
                      <span style={{ fontSize:11, color:'var(--text-3)' }}>{dayCal.toLocaleString()} cal</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Muscle gain tips */}
          <div className="card" style={{ padding:'14px 16px', marginBottom:24 }}>
            <div className="section-title" style={{ marginBottom:10 }}>FOR WEIGHT + MUSCLE GAIN</div>
            {[
              '🥚 Eat more than you feel like — your body is used to less right now',
              '🥜 Add peanut butter to everything — uji, bread, smoothies. 1 jar = +10,000 calories',
              '🥛 Drink full glass of milk before bed every night — overnight muscle repair',
              '🍌 Groundnuts + banana daily is the cheapest high-calorie snack in Kenya',
              '🏋️ Even 20 pushups + 20 squats daily triples how fast you gain from food',
            ].map((tip,i) => (
              <div key={i} style={{ fontSize:13, color:'var(--text-2)', marginBottom:8, lineHeight:1.5 }}>{tip}</div>
            ))}
          </div>
        </div>
      </div>
      {showTxn && <TransactionModal onClose={() => setShowTxn(false)} />}
    </Layout>
  );
}
