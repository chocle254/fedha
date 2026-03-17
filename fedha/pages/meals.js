import { useState } from 'react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatShort, todayISO } from '../lib/utils';

// ─── INGREDIENT DATABASE ─────────────────────────────────────────────────────
const ALL_INGREDIENTS = [
  // Staples
  { id:'unga_ugali', name:'Unga wa Ugali', category:'staples', cost:5, unit:'per serving', emoji:'🌽' },
  { id:'unga_wimbi', name:'Unga wa Wimbi', category:'staples', cost:8, unit:'per serving', emoji:'🌾' },
  { id:'rice', name:'Rice', category:'staples', cost:15, unit:'per serving', emoji:'🍚' },
  { id:'bread', name:'Bread', category:'staples', cost:20, unit:'per loaf', emoji:'🍞' },
  { id:'chapati_flour', name:'Flour (Chapati/Mandazi)', category:'staples', cost:10, unit:'per serving', emoji:'🌾' },
  { id:'oats', name:'Oats', category:'staples', cost:20, unit:'per serving', emoji:'🥣' },
  { id:'spaghetti', name:'Spaghetti/Pasta', category:'staples', cost:25, unit:'per serving', emoji:'🍝' },
  // Proteins
  { id:'eggs', name:'Eggs', category:'protein', cost:15, unit:'per 3 eggs', emoji:'🥚' },
  { id:'beans', name:'Beans', category:'protein', cost:20, unit:'per serving', emoji:'🫘' },
  { id:'lentils', name:'Ndengu (Green Grams)', category:'protein', cost:20, unit:'per serving', emoji:'🫘' },
  { id:'groundnuts', name:'Groundnuts', category:'protein', cost:15, unit:'per cup', emoji:'🥜' },
  { id:'omena', name:'Omena (Dagaa)', category:'protein', cost:30, unit:'per serving', emoji:'🐟' },
  { id:'tilapia', name:'Tilapia', category:'protein', cost:120, unit:'per fish', emoji:'🐠' },
  { id:'chicken', name:'Chicken', category:'protein', cost:200, unit:'per piece', emoji:'🍗' },
  { id:'beef', name:'Beef', category:'protein', cost:150, unit:'per serving', emoji:'🥩' },
  { id:'goat', name:'Goat Meat', category:'protein', cost:180, unit:'per serving', emoji:'🥩' },
  { id:'sausages', name:'Sausages', category:'protein', cost:60, unit:'per pack', emoji:'🌭' },
  { id:'peanut_butter', name:'Peanut Butter', category:'protein', cost:50, unit:'per jar', emoji:'🥜' },
  // Vegetables
  { id:'sukuma', name:'Sukuma Wiki', category:'vegetables', cost:10, unit:'per bunch', emoji:'🥬' },
  { id:'cabbage', name:'Cabbage', category:'vegetables', cost:20, unit:'per head', emoji:'🥦' },
  { id:'spinach', name:'Spinach/Mchicha', category:'vegetables', cost:10, unit:'per bunch', emoji:'🥬' },
  { id:'tomatoes', name:'Tomatoes', category:'vegetables', cost:15, unit:'per 3pcs', emoji:'🍅' },
  { id:'onions', name:'Onions', category:'vegetables', cost:10, unit:'per 2pcs', emoji:'🧅' },
  { id:'carrots', name:'Carrots', category:'vegetables', cost:15, unit:'per bunch', emoji:'🥕' },
  { id:'hoho', name:'Hoho (Bell Pepper)', category:'vegetables', cost:10, unit:'per piece', emoji:'🫑' },
  { id:'garlic', name:'Garlic', category:'vegetables', cost:10, unit:'per bulb', emoji:'🧄' },
  { id:'peas', name:'Green Peas', category:'vegetables', cost:20, unit:'per serving', emoji:'🫛' },
  // Tubers
  { id:'sweet_potato', name:'Sweet Potatoes', category:'tubers', cost:30, unit:'per kg', emoji:'🍠' },
  { id:'irish_potato', name:'Irish Potatoes', category:'tubers', cost:30, unit:'per kg', emoji:'🥔' },
  { id:'arrow_root', name:'Arrow Roots (Nduma)', category:'tubers', cost:30, unit:'per kg', emoji:'🌿' },
  // Dairy & extras
  { id:'milk', name:'Milk', category:'dairy', cost:50, unit:'per litre', emoji:'🥛' },
  { id:'yogurt', name:'Yogurt', category:'dairy', cost:60, unit:'per cup', emoji:'🥛' },
  { id:'avocado', name:'Avocado', category:'extras', cost:20, unit:'per piece', emoji:'🥑' },
  { id:'banana', name:'Bananas', category:'extras', cost:20, unit:'per bunch', emoji:'🍌' },
  { id:'mango', name:'Mango/Pawpaw', category:'extras', cost:20, unit:'per piece', emoji:'🥭' },
  { id:'oil', name:'Cooking Oil', category:'extras', cost:20, unit:'per serving', emoji:'🫙' },
  { id:'spices', name:'Spices & Salt', category:'extras', cost:5, unit:'general', emoji:'🧂' },
  { id:'tea_leaves', name:'Tea Leaves + Sugar', category:'extras', cost:10, unit:'per serving', emoji:'🍵' },
  { id:'coconut_milk', name:'Coconut Milk', category:'extras', cost:40, unit:'per tin', emoji:'🥥' },
];

const CATEGORIES = ['staples','protein','vegetables','tubers','dairy','extras'];
const CAT_LABELS = { staples:'Staples', protein:'Protein', vegetables:'Vegetables', tubers:'Tubers & Roots', dairy:'Dairy', extras:'Extras & Fruit' };

// ─── RECIPE DATABASE ─────────────────────────────────────────────────────────
// Each recipe has required ingredients (must have) and optional ones
const RECIPES = [
  // Budget meals (cost < 150)
  { id:'uji_eggs', name:'Uji wa Wimbi + Eggs', emoji:'🥣', cost:55, cal:520, protein:'22g', time:'20 min', requires:['unga_wimbi','eggs'], optional:['milk','peanut_butter','banana'], instructions:'Boil water, add wimbi flour stirring to avoid lumps. Cook 10 min. Boil or fry eggs separately. Add peanut butter to uji if available.', tip:'Add a spoon of peanut butter to the uji for extra 100 calories.', isWeekend:false },
  { id:'ugali_beans', name:'Ugali + Beans + Sukuma', emoji:'🍽️', cost:60, cal:780, protein:'28g', time:'45 min', requires:['unga_ugali','beans','sukuma','tomatoes','onions','oil'], optional:['hoho','garlic','spices'], instructions:'Soak beans overnight or boil 45min. Fry onions, tomatoes, add beans and season. Make ugali separately. Fry sukuma in oil with onions.', tip:'Cook a big pot of beans — use leftovers for 2 days to save time and gas.', isWeekend:false },
  { id:'ugali_eggs_sw', name:'Ugali + Scrambled Eggs', emoji:'🍽️', cost:50, cal:620, protein:'24g', time:'20 min', requires:['unga_ugali','eggs','tomatoes','onions','oil'], optional:['hoho','sukuma','spices'], instructions:'Make ugali. Fry onions and tomatoes, scramble eggs in. Season well.', tip:'Use 3 eggs minimum — each egg is pure muscle fuel.', isWeekend:false },
  { id:'sweet_potato_eggs', name:'Sweet Potato + Eggs', emoji:'🍠', cost:55, cal:650, protein:'19g', time:'25 min', requires:['sweet_potato','eggs','oil','onions','tomatoes'], optional:['sukuma','spices'], instructions:'Boil or roast sweet potatoes. Scramble eggs with onions and tomatoes. Serve together.', tip:'Sweet potato before bed gives slow-release carbs for overnight muscle recovery.', isWeekend:false },
  { id:'bread_groundnuts', name:'Bread + Groundnuts + Chai', emoji:'🍞', cost:45, cal:480, protein:'16g', time:'10 min', requires:['bread','groundnuts','tea_leaves'], optional:['milk','peanut_butter','banana'], instructions:'Toast bread if possible. Spread peanut butter if available. Brew strong chai with milk. Eat groundnuts on the side.', tip:'Cheapest high-calorie breakfast — peanut butter is the most important thing to always have.', isWeekend:false },
  { id:'githeri', name:'Githeri + Vegetables', emoji:'🫘', cost:65, cal:720, protein:'26g', time:'60 min', requires:['beans','unga_ugali','onions','oil'], optional:['irish_potato','carrots','tomatoes','spices'], instructions:'Boil maize and beans together (or use pre-soaked). Add potatoes and carrots. Fry onions and tomatoes, mix in. Season well.', tip:'Githeri is nutritionally complete — carbs, protein and fiber all in one pot.', isWeekend:false },
  { id:'rice_omena', name:'Rice + Omena Stew', emoji:'🐟', cost:70, cal:780, protein:'36g', time:'30 min', requires:['rice','omena','tomatoes','onions','oil'], optional:['hoho','sukuma','garlic','spices'], instructions:'Fry omena until crispy in oil. Remove. Fry onions, tomatoes, garlic, add back omena. Simmer 10 min. Cook rice separately.', tip:'Omena is the most protein-dense cheap food in Kenya. Fry it crispy for the best taste.', isWeekend:false },
  { id:'lentil_ugali', name:'Ugali + Ndengu Stew', emoji:'🫘', cost:55, cal:700, protein:'28g', time:'30 min', requires:['unga_ugali','lentils','tomatoes','onions','oil'], optional:['hoho','spinach','spices','garlic'], instructions:'Boil ndengu 25 min until soft. Fry onions, tomatoes, garlic, add ndengu. Season well. Make ugali.', tip:'Green grams cook faster than beans and have more protein. Great weekday shortcut.', isWeekend:false },
  { id:'spaghetti_veg', name:'Spaghetti + Vegetable Sauce', emoji:'🍝', cost:80, cal:720, protein:'20g', time:'25 min', requires:['spaghetti','tomatoes','onions','oil'], optional:['hoho','carrots','garlic','spices','eggs'], instructions:'Boil spaghetti. Fry onions, add tomatoes and vegetables, season. Mix in spaghetti. Fry an egg on top if available.', tip:'Beat an egg into the sauce while hot — it coats the pasta with extra protein.', isWeekend:false },
  { id:'oats_eggs', name:'Oatmeal + Milk + Eggs', emoji:'🥣', cost:80, cal:720, protein:'30g', time:'15 min', requires:['oats','milk','eggs'], optional:['banana','peanut_butter','tea_leaves'], instructions:'Simmer oats in milk until thick. Add sugar. Fry or boil eggs separately.', tip:'Oats keep you full for 4 hours. This is a gym-quality breakfast at a low cost.', isWeekend:false },
  // Mid-range meals (100-200)
  { id:'rice_beef', name:'Rice + Beef Stew', emoji:'🍚', cost:180, cal:980, protein:'52g', time:'40 min', requires:['rice','beef','tomatoes','onions','oil'], optional:['hoho','carrots','garlic','spices','sukuma','avocado'], instructions:'Brown beef in oil. Add onions, tomatoes, garlic, hoho. Simmer 25 min until tender. Cook rice. Serve with kachumbari if available.', tip:'Eat a large plate — this is your main muscle-building meal.', isWeekend:false },
  { id:'ugali_tilapia', name:'Ugali + Fried Tilapia + Sukuma', emoji:'🐠', cost:160, cal:820, protein:'48g', time:'30 min', requires:['unga_ugali','tilapia','oil','sukuma'], optional:['tomatoes','onions','hoho','lemon','spices'], instructions:'Season and fry whole tilapia until crispy. Make ugali. Fry sukuma with onions. Serve together.', tip:'Fish twice a week significantly speeds up muscle building.', isWeekend:false },
  { id:'chapati_eggs', name:'Chapati + Scrambled Eggs + Chai', emoji:'🥞', cost:90, cal:780, protein:'28g', time:'30 min', requires:['chapati_flour','eggs','oil','tea_leaves'], optional:['tomatoes','onions','milk','avocado','hoho'], instructions:'Make chapati dough, roll thin and cook on dry pan until golden. Scramble eggs with onions, tomatoes. Brew chai with milk.', tip:'Spread avocado on chapati instead of butter — healthier fats for better energy.', isWeekend:false },
  { id:'ugali_chicken', name:'Ugali + Chicken Stew + Cabbage', emoji:'🍗', cost:220, cal:980, protein:'56g', time:'50 min', requires:['unga_ugali','chicken','tomatoes','onions','oil'], optional:['hoho','garlic','cabbage','spices','carrots'], instructions:'Brown chicken, add onions, tomatoes, garlic. Simmer 35 min. Make ugali. Braise cabbage in oil.', tip:'Chicken thighs have more flavor than breast and cost less.', isWeekend:false },
  // Weekend meals (cost 100-400, more elaborate)
  { id:'pilau', name:'Pilau Rice + Kachumbari', emoji:'🍛', cost:150, cal:880, protein:'28g', time:'50 min', requires:['rice','onions','oil','spices'], optional:['beef','chicken','tomatoes','garlic','hoho'], instructions:'Fry onions dark brown. Add pilau masala, rice, water 1:2 ratio. Cook 20 min. Make kachumbari (tomatoes, onions, hoho, lemon).', tip:'Good pilau needs dark fried onions and real pilau masala — do not rush this step.', isWeekend:true },
  { id:'coconut_rice_fish', name:'Coconut Rice + Fish + Salad', emoji:'🥥', cost:190, cal:880, protein:'44g', time:'40 min', requires:['rice','tilapia','coconut_milk','oil'], optional:['sukuma','tomatoes','onions','garlic','spices','lemon'], instructions:'Cook rice in coconut milk instead of water. Season and fry fish. Make a fresh salad.', tip:'Coconut rice makes everything taste better and adds healthy fats.', isWeekend:true },
  { id:'chapati_beef', name:'Chapati + Beef Stew + Salad', emoji:'🥙', cost:250, cal:1020, protein:'56g', time:'60 min', requires:['chapati_flour','beef','tomatoes','onions','oil'], optional:['hoho','garlic','avocado','spices','carrots'], instructions:'Make soft chapati. Cook beef stew with lots of onions, tomatoes and spices. Make fresh kachumbari.', tip:'Saturday chapati — make them slightly thicker and richer. Worth the extra time.', isWeekend:true },
  { id:'biryani', name:'Chicken Biryani', emoji:'🍛', cost:300, cal:1080, protein:'58g', time:'60 min', requires:['rice','chicken','spices','onions','oil'], optional:['yogurt','tomatoes','garlic','hoho','carrots'], instructions:'Fry onions brown, add chicken and spices. Add rice and water 1:1.5. Cook sealed 25 min. Let rest 10 min.', tip:'Biryani is a complete meal — carbs, protein, fats and spices. Best Sunday cook.', isWeekend:true },
  { id:'mutura_ugali', name:'Mutura + Ugali + Kachumbari', emoji:'🌭', cost:180, cal:920, protein:'44g', time:'30 min', requires:['unga_ugali','sausages','tomatoes','onions'], optional:['hoho','avocado','spices','oil'], instructions:'Grill or pan-fry mutura/sausages. Make ugali. Prepare fresh kachumbari on the side.', tip:'Weekend treat meal. Eat a big portion.', isWeekend:true },
  { id:'mukimo_beef', name:'Mukimo + Beef Stew', emoji:'🥔', cost:230, cal:960, protein:'46g', time:'50 min', requires:['irish_potato','peas','beef','onions','oil'], optional:['spinach','tomatoes','garlic','spices'], instructions:'Boil potatoes with peas and spinach, mash together. Cook beef stew with onions and tomatoes.', tip:'Mukimo + meat is one of the most balanced meals you can make.', isWeekend:true },
];

const MEAL_TYPES = [
  { id:'breakfast', label:'Breakfast', icon:'🌅', maxCost:100 },
  { id:'snack', label:'10am Snack', icon:'🍌', maxCost:40 },
  { id:'lunch', label:'Lunch', icon:'☀️', maxCost:200 },
  { id:'dinner', label:'Dinner', icon:'🌙', maxCost:180 },
];

export default function MealsPage() {
  const { wallets, budgets, loans, currency, addTransaction } = useApp();
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [suggestions, setSuggestions] = useState(null);
  const [activeCategory, setActiveCategory] = useState('staples');
  const [mealType, setMealType] = useState('lunch');
  const [showTxn, setShowTxn] = useState(false);
  const [recordingMeal, setRecordingMeal] = useState(null);
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');

  const isWeekend = [0, 6].includes(new Date().getDay());

  // Floating cash
  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance || 0), 0);
  const totalBudgeted = budgets.reduce((s, b) => s + Math.max(0, Number(b.allocated || 0) - Number(b.spent || 0)), 0);
  const totalOwed = loans.filter(l => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount || 0), 0);
  const floating = Math.max(0, totalBalance - totalBudgeted - totalOwed);
  const foodBudget = Math.min(isWeekend ? 500 : 200, floating * 0.2);

  function toggleIngredient(id) {
    setSelectedIngredients(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setSuggestions(null);
  }

  function getSuggestions() {
    const type = MEAL_TYPES.find(t => t.id === mealType);
    const maxCost = Math.min(type.maxCost, foodBudget);

    // Score recipes by: matching ingredients, budget fit, weekend status
    const scored = RECIPES
      .filter(r => {
        // Weekend recipes only on weekend, weekday recipes always available
        if (r.isWeekend && !isWeekend) return false;
        // Must fit budget
        if (r.cost > maxCost * 1.3) return false;
        return true;
      })
      .map(r => {
        const hasRequired = r.requires.filter(req => selectedIngredients.includes(req));
        const missingRequired = r.requires.filter(req => !selectedIngredients.includes(req));
        const matchScore = hasRequired.length / r.requires.length;
        const costScore = 1 - Math.abs(r.cost - maxCost * 0.7) / maxCost;
        return { ...r, matchScore, missingRequired, totalScore: matchScore * 0.7 + costScore * 0.3 };
      })
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 4);

    setSuggestions({ recipes: scored, foodBudget, maxCost, isWeekend });
  }

  // Ingredients user should add to buy based on balance
  const missingIngredientsAll = suggestions?.recipes[0]?.missingRequired || [];
  const ingredientsToBuy = missingIngredientsAll.map(id => ALL_INGREDIENTS.find(i => i.id === id)).filter(Boolean);
  const buyTotal = ingredientsToBuy.reduce((s, i) => s + i.cost, 0);
  const canAffordBuy = buyTotal <= floating;

  async function recordMealCost(recipe) {
    await addTransaction({
      type: 'expense',
      amount: recipe.cost,
      wallet_id: walletId,
      category: 'food',
      description: `Meal: ${recipe.name}`,
      date: todayISO(),
      currency,
    });
    setRecordingMeal(null);
  }

  const selectedDetails = ALL_INGREDIENTS.filter(i => selectedIngredients.includes(i.id));

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        <div className="page-header">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
            <h1 style={{ fontSize:22, fontWeight:700 }}>Meal Planner 🍽️</h1>
            <div style={{ textAlign:'right' }}>
              <div className="font-num" style={{ fontSize:14, fontWeight:700, color:'var(--green)' }}>{formatShort(floating, currency)}</div>
              <div style={{ fontSize:11, color:'var(--text-3)' }}>floating cash</div>
            </div>
          </div>
          <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:12 }}>
            {isWeekend ? '🎉 Weekend — better meals unlocked!' : '📅 Weekday'} · Food budget today: <span style={{ color:'var(--green)', fontWeight:600 }}>{formatShort(foodBudget, currency)}</span>
          </div>

          {/* Meal type selector */}
          <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:2 }}>
            {MEAL_TYPES.map(t => (
              <button key={t.id} className={`chip ${mealType===t.id?'active':''}`} onClick={() => { setMealType(t.id); setSuggestions(null); }} style={{ flexShrink:0 }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding:'0 20px' }}>

          {/* Ingredient selector */}
          <div style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div className="section-title" style={{ marginBottom:0 }}>WHAT DO YOU HAVE?</div>
              {selectedIngredients.length > 0 && (
                <button onClick={() => { setSelectedIngredients([]); setSuggestions(null); }} style={{ fontSize:12, color:'var(--red)', background:'none', border:'none', cursor:'pointer', fontFamily:'Outfit' }}>
                  Clear all
                </button>
              )}
            </div>

            {/* Category tabs */}
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:8 }}>
              {CATEGORIES.map(cat => (
                <button key={cat} className={`chip ${activeCategory===cat?'active':''}`} onClick={() => setActiveCategory(cat)} style={{ flexShrink:0, fontSize:12 }}>
                  {CAT_LABELS[cat]}
                </button>
              ))}
            </div>

            {/* Ingredient grid */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {ALL_INGREDIENTS.filter(i => i.category === activeCategory).map(ing => {
                const selected = selectedIngredients.includes(ing.id);
                return (
                  <button key={ing.id} onClick={() => toggleIngredient(ing.id)}
                    style={{ padding:'8px 12px', borderRadius:10, border:`1px solid ${selected ? 'var(--green)' : 'var(--border)'}`, background: selected ? 'var(--green-dim)' : 'var(--card-2)', color: selected ? 'var(--green)' : 'var(--text-2)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'Outfit', display:'flex', alignItems:'center', gap:6 }}>
                    <span>{ing.emoji}</span>
                    <span>{ing.name}</span>
                    {selected && <span style={{ fontWeight:700 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected ingredients summary */}
          {selectedIngredients.length > 0 && (
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
              <div style={{ fontSize:12, color:'var(--text-3)', fontWeight:600, textTransform:'uppercase', letterSpacing:0.8, marginBottom:8 }}>
                You have {selectedIngredients.length} ingredient{selectedIngredients.length>1?'s':''}
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {selectedDetails.map(i => (
                  <span key={i.id} style={{ fontSize:13, padding:'3px 10px', background:'var(--card-2)', borderRadius:100, color:'var(--text-2)', display:'flex', alignItems:'center', gap:4 }}>
                    {i.emoji} {i.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Suggest button */}
          <button className="btn-primary" onClick={getSuggestions} disabled={selectedIngredients.length === 0}
            style={{ marginBottom:20 }}>
            {selectedIngredients.length === 0 ? 'Select ingredients above first' : `🍽️ Suggest ${MEAL_TYPES.find(t=>t.id===mealType)?.label} Meals`}
          </button>

          {/* Suggestions */}
          {suggestions && (
            <div>
              <div className="section-title">BEST MATCHES FOR YOU</div>

              {/* Buy more ingredients prompt */}
              {ingredientsToBuy.length > 0 && (
                <div style={{ background: canAffordBuy ? 'rgba(59,130,246,0.08)' : 'var(--red-dim)', border:`1px solid ${canAffordBuy ? 'rgba(59,130,246,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, color: canAffordBuy ? 'var(--blue)' : 'var(--red)', marginBottom:8 }}>
                    {canAffordBuy ? '🛒 Buy these to unlock the top recipe:' : '⚠️ Best recipe needs these — slightly over budget:'}
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                    {ingredientsToBuy.map(i => (
                      <span key={i.id} style={{ fontSize:12, padding:'3px 10px', background:'var(--card-2)', borderRadius:100, color:'var(--text-2)' }}>
                        {i.emoji} {i.name} ~KSh {i.cost}
                      </span>
                    ))}
                  </div>
                  <div className="font-num" style={{ fontSize:13, fontWeight:700, color: canAffordBuy ? 'var(--blue)' : 'var(--red)' }}>
                    Total to buy: KSh {buyTotal} · {canAffordBuy ? 'You can afford this' : `You need KSh ${buyTotal - Math.round(floating)} more`}
                  </div>
                </div>
              )}

              <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:24 }}>
                {suggestions.recipes.map((recipe, idx) => {
                  const matchPct = Math.round(recipe.matchScore * 100);
                  const canMake = recipe.missingRequired.length === 0;
                  const overBudget = recipe.cost > suggestions.maxCost;
                  return (
                    <div key={recipe.id} className="card" style={{ padding:'16px', borderLeft:`3px solid ${idx===0 ? 'var(--green)' : 'var(--border)'}`, borderColor: idx===0 ? undefined : 'var(--border)' }}>
                      {idx === 0 && <div style={{ fontSize:10, color:'var(--green)', fontWeight:700, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>⭐ BEST MATCH</div>}
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                        <div style={{ display:'flex', gap:10, alignItems:'flex-start', flex:1 }}>
                          <span style={{ fontSize:26 }}>{recipe.emoji}</span>
                          <div>
                            <div style={{ fontSize:15, fontWeight:700 }}>{recipe.name}</div>
                            <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>
                              {recipe.cal} cal · {recipe.protein} protein · {recipe.time}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div className="font-num" style={{ fontSize:15, fontWeight:700, color: overBudget ? 'var(--red)' : 'var(--green)' }}>~KSh {recipe.cost}</div>
                          <div style={{ fontSize:11, color: matchPct===100 ? 'var(--green)' : 'var(--text-3)', marginTop:2 }}>
                            {matchPct}% match
                          </div>
                        </div>
                      </div>

                      {/* Missing ingredients */}
                      {recipe.missingRequired.length > 0 && (
                        <div style={{ fontSize:12, color:'var(--red)', marginBottom:8, background:'var(--red-dim)', padding:'6px 10px', borderRadius:8 }}>
                          Missing: {recipe.missingRequired.map(id => ALL_INGREDIENTS.find(i=>i.id===id)?.name).join(', ')}
                        </div>
                      )}

                      <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.5, marginBottom:8 }}>{recipe.instructions}</div>
                      <div style={{ fontSize:12, color:'var(--text-3)', background:'var(--card-2)', padding:'8px 10px', borderRadius:8, marginBottom:12 }}>
                        💡 {recipe.tip}
                      </div>

                      {canMake && (
                        <button onClick={() => setRecordingMeal(recipe)}
                          style={{ width:'100%', padding:'10px', background:'var(--green-dim)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:10, color:'var(--green)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Outfit' }}>
                          ✓ I'm cooking this — record cost
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Record meal cost modal */}
      {recordingMeal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setRecordingMeal(null)}>
          <div className="modal-sheet">
            <div style={{ width:36, height:4, background:'var(--border)', borderRadius:2, margin:'12px auto' }} />
            <div className="modal-header">
              <span style={{ fontSize:16, fontWeight:700 }}>{recordingMeal.emoji} Record Meal Cost</span>
              <button className="btn-icon" onClick={() => setRecordingMeal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize:14, color:'var(--text-2)' }}>{recordingMeal.name}</div>
              <div style={{ padding:'12px 14px', background:'var(--green-dim)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:10, display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:13, color:'var(--text-2)' }}>Estimated cost</span>
                <span className="font-num" style={{ fontSize:14, fontWeight:700, color:'var(--green)' }}>KSh {recordingMeal.cost}</span>
              </div>
              <div>
                <label style={{ fontSize:12, color:'var(--text-3)', fontWeight:600, letterSpacing:1, textTransform:'uppercase', display:'block', marginBottom:8 }}>Pay from</label>
                <select className="input" value={walletId} onChange={e => setWalletId(e.target.value)}>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
                </select>
              </div>
              <button className="btn-primary" onClick={() => recordMealCost(recordingMeal)}>Record KSh {recordingMeal.cost} Food Expense</button>
            </div>
          </div>
        </div>
      )}

      {showTxn && <TransactionModal onClose={() => setShowTxn(false)} />}
    </Layout>
  );
}
