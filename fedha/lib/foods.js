// Kenyan food database for the Food Diary.
// Calories (cal) and protein (g) are per typical single serving.

export const FOOD_GROUPS = [
  { id: 'staples',    label: 'Staples & Carbs' },
  { id: 'proteins',   label: 'Proteins' },
  { id: 'vegetables', label: 'Vegetables' },
  { id: 'fruitsnack', label: 'Fruit & Snacks' },
  { id: 'drinks',     label: 'Drinks' },
];

export const COMMON_FOODS = [
  // ── Staples & Carbs ──
  { id: 'ugali',        name: 'Ugali (1 serving)',        cal: 290, protein: 7,  icon: '🍚', group: 'staples' },
  { id: 'rice',         name: 'Rice (1 cup cooked)',      cal: 240, protein: 4,  icon: '🍚', group: 'staples' },
  { id: 'chapati',      name: 'Chapati (1)',              cal: 300, protein: 6,  icon: '🫓', group: 'staples' },
  { id: 'sweetpotato',  name: 'Sweet Potato (1 boiled)',  cal: 130, protein: 2,  icon: '🍠', group: 'staples' },
  { id: 'nduma',        name: 'Arrow Root / Nduma (1)',   cal: 120, protein: 1,  icon: '🥔', group: 'staples' },
  { id: 'bread',        name: 'Bread (1 slice)',          cal: 80,  protein: 3,  icon: '🍞', group: 'staples' },
  { id: 'mandazi',      name: 'Mandazi (1)',              cal: 150, protein: 3,  icon: '🍩', group: 'staples' },
  { id: 'mahamri',      name: 'Mahamri (1)',              cal: 140, protein: 3,  icon: '🍩', group: 'staples' },
  { id: 'githeri',      name: 'Githeri (1 plate)',        cal: 350, protein: 16, icon: '🥘', group: 'staples' },
  { id: 'pilau',        name: 'Pilau (1 plate)',          cal: 410, protein: 10, icon: '🍛', group: 'staples' },
  { id: 'spaghetti',    name: 'Spaghetti (1 plate)',      cal: 220, protein: 8,  icon: '🍝', group: 'staples' },
  { id: 'mukimo',       name: 'Mukimo (1 serving)',       cal: 280, protein: 8,  icon: '🥗', group: 'staples' },
  { id: 'matoke',       name: 'Matoke (1 serving)',       cal: 200, protein: 3,  icon: '🍌', group: 'staples' },
  { id: 'oatmeal',      name: 'Oatmeal (1 bowl)',         cal: 150, protein: 5,  icon: '🥣', group: 'staples' },
  { id: 'uji',          name: 'Uji (1 cup)',              cal: 120, protein: 4,  icon: '🥣', group: 'staples' },
  { id: 'fries',        name: 'Chips / Fries (1 plate)',  cal: 360, protein: 5,  icon: '🍟', group: 'staples' },

  // ── Proteins ──
  { id: 'egg_boiled',   name: 'Boiled Egg (1)',           cal: 78,  protein: 6,  icon: '🥚', group: 'proteins' },
  { id: 'egg_fried',    name: 'Fried Egg (1)',            cal: 90,  protein: 6,  icon: '🍳', group: 'proteins' },
  { id: 'beef_stew',    name: 'Beef Stew (1 serving)',    cal: 250, protein: 26, icon: '🥩', group: 'proteins' },
  { id: 'chicken_thigh',name: 'Chicken Thigh (1)',        cal: 210, protein: 26, icon: '🍗', group: 'proteins' },
  { id: 'chicken_breast',name:'Chicken Breast (1)',       cal: 165, protein: 31, icon: '🍗', group: 'proteins' },
  { id: 'tilapia',      name: 'Tilapia (1 medium)',       cal: 220, protein: 30, icon: '🐟', group: 'proteins' },
  { id: 'omena',        name: 'Omena (1 serving)',        cal: 180, protein: 25, icon: '🐟', group: 'proteins' },
  { id: 'beans',        name: 'Beans (1 cup)',            cal: 230, protein: 15, icon: '🫘', group: 'proteins' },
  { id: 'ndengu',       name: 'Ndengu / Green Grams',     cal: 210, protein: 14, icon: '🫛', group: 'proteins' },
  { id: 'liver',        name: 'Chicken Liver (1 serving)',cal: 170, protein: 24, icon: '🥩', group: 'proteins' },
  { id: 'matumbo',      name: 'Matumbo / Offcuts',        cal: 230, protein: 22, icon: '🥩', group: 'proteins' },
  { id: 'sausage',      name: 'Sausage (1)',              cal: 120, protein: 5,  icon: '🌭', group: 'proteins' },
  { id: 'smokie',       name: 'Smokie (1)',               cal: 130, protein: 5,  icon: '🌭', group: 'proteins' },

  // ── Vegetables ──
  { id: 'sukuma',       name: 'Sukuma Wiki (1 serving)',  cal: 60,  protein: 3,  icon: '🥬', group: 'vegetables' },
  { id: 'cabbage',      name: 'Cabbage (1 serving)',      cal: 50,  protein: 2,  icon: '🥬', group: 'vegetables' },
  { id: 'kachumbari',   name: 'Kachumbari (1 serving)',   cal: 40,  protein: 1,  icon: '🥗', group: 'vegetables' },
  { id: 'managu',       name: 'Managu / Terere',          cal: 55,  protein: 4,  icon: '🥬', group: 'vegetables' },
  { id: 'spinach',      name: 'Spinach (1 serving)',      cal: 45,  protein: 3,  icon: '🥬', group: 'vegetables' },

  // ── Fruit & Snacks ──
  { id: 'banana',       name: 'Banana (1)',               cal: 105, protein: 1,  icon: '🍌', group: 'fruitsnack' },
  { id: 'mango',        name: 'Mango (1)',                cal: 200, protein: 3,  icon: '🥭', group: 'fruitsnack' },
  { id: 'avocado',      name: 'Avocado (1)',              cal: 240, protein: 3,  icon: '🥑', group: 'fruitsnack' },
  { id: 'orange',       name: 'Orange (1)',               cal: 60,  protein: 1,  icon: '🍊', group: 'fruitsnack' },
  { id: 'pawpaw',       name: 'Pawpaw (1 serving)',       cal: 60,  protein: 1,  icon: '🍈', group: 'fruitsnack' },
  { id: 'groundnuts',   name: 'Groundnuts (handful)',     cal: 170, protein: 7,  icon: '🥜', group: 'fruitsnack' },
  { id: 'peanutbutter', name: 'Peanut Butter (1 tbsp)',   cal: 95,  protein: 4,  icon: '🥜', group: 'fruitsnack' },
  { id: 'yogurt',       name: 'Yogurt (1 cup)',           cal: 150, protein: 8,  icon: '🥛', group: 'fruitsnack' },
  { id: 'samosa',       name: 'Samosa (1)',               cal: 130, protein: 4,  icon: '🥟', group: 'fruitsnack' },
  { id: 'crisps',       name: 'Crisps (small pack)',      cal: 150, protein: 2,  icon: '🥔', group: 'fruitsnack' },

  // ── Drinks ──
  { id: 'milk',         name: 'Milk (1 glass)',           cal: 120, protein: 8,  icon: '🥛', group: 'drinks' },
  { id: 'mala',         name: 'Mala (1 glass)',           cal: 110, protein: 8,  icon: '🥛', group: 'drinks' },
  { id: 'chai',         name: 'Chai ya Maziwa (1 cup)',   cal: 90,  protein: 3,  icon: '☕', group: 'drinks' },
  { id: 'coffee',       name: 'Black Coffee (1 cup)',     cal: 5,   protein: 0,  icon: '☕', group: 'drinks' },
  { id: 'soda',         name: 'Soda (1 can)',             cal: 140, protein: 0,  icon: '🥤', group: 'drinks' },
  { id: 'juice',        name: 'Fruit Juice (1 glass)',    cal: 110, protein: 1,  icon: '🧃', group: 'drinks' },
  { id: 'smoothie',     name: 'Banana PB Smoothie',       cal: 580, protein: 16, icon: '🥤', group: 'drinks' },
];

export const MEAL_SLOTS = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅', color: '#F59E0B' },
  { id: 'snack',     label: 'Snack',     icon: '🍌', color: '#10B981' },
  { id: 'lunch',     label: 'Lunch',     icon: '🍲', color: '#3B82F6' },
  { id: 'dinner',    label: 'Dinner',    icon: '🌙', color: '#8B5CF6' },
];

// Decide which slot a food most likely belongs to, used as a sensible default.
export function defaultSlotForHour(hour) {
  if (hour < 10) return 'breakfast';
  if (hour < 12) return 'snack';
  if (hour < 16) return 'lunch';
  if (hour < 18) return 'snack';
  return 'dinner';
}

// Ready-made Kenyan meal combos built from COMMON_FOODS ids.
export const MEAL_IDEAS = [
  { id:'eggs_bread_milk', name:'Eggs + Bread + Milk', ids:['egg_boiled','bread','milk'], slot:'breakfast', tags:['protein','energy'] },
  { id:'oats_banana_pb', name:'Oatmeal + Banana + Peanut Butter', ids:['oatmeal','banana','peanutbutter'], slot:'breakfast', tags:['high-calorie','energy'] },
  { id:'eggs_chapati_milk', name:'Eggs + Chapati + Milk', ids:['egg_boiled','chapati','milk'], slot:'breakfast', tags:['high-calorie','protein'] },
  { id:'uji_eggs', name:'Uji + 2 Boiled Eggs', ids:['uji','egg_boiled','egg_boiled'], slot:'breakfast', tags:['budget','protein'] },
  { id:'banana_pb_milk', name:'Banana + Peanut Butter + Milk', ids:['banana','peanutbutter','milk'], slot:'snack', tags:['high-calorie','protein'] },
  { id:'yogurt_groundnuts', name:'Yogurt + Groundnuts', ids:['yogurt','groundnuts'], slot:'snack', tags:['protein'] },
  { id:'mala_mandazi', name:'Mala + Mandazi', ids:['mala','mandazi'], slot:'snack', tags:['budget','Kenyan'] },
  { id:'ugali_beef_sukuma', name:'Ugali + Beef Stew + Sukuma Wiki', ids:['ugali','beef_stew','sukuma'], slot:'lunch', tags:['protein','balanced'] },
  { id:'rice_beans_avocado', name:'Rice + Beans + Avocado', ids:['rice','beans','avocado'], slot:'lunch', tags:['protein','budget'] },
  { id:'githeri_avocado', name:'Githeri + Avocado', ids:['githeri','avocado'], slot:'lunch', tags:['protein','Kenyan'] },
  { id:'chapati_ndengu', name:'Chapati + Ndengu', ids:['chapati','ndengu'], slot:'lunch', tags:['budget','protein'] },
  { id:'ugali_omena_sukuma', name:'Ugali + Omena + Sukuma Wiki', ids:['ugali','omena','sukuma'], slot:'dinner', tags:['protein','Kenyan'] },
  { id:'rice_chicken_cabbage', name:'Rice + Chicken + Cabbage', ids:['rice','chicken_thigh','cabbage'], slot:'dinner', tags:['protein','balanced'] },
  { id:'ugali_tilapia_kachumbari', name:'Ugali + Tilapia + Kachumbari', ids:['ugali','tilapia','kachumbari'], slot:'dinner', tags:['protein','Kenyan'] },
];

// Ranks meal ideas for *right now*: drops anything with a disliked food or
// meal, anything you can't afford (when prices are known), and prefers the
// current meal slot and meals that close today's protein/calorie gap without
// blowing far past it. Each result carries a plain-language `reason`.
export function rankMealIdeas({ foods, profile = {}, floating = Infinity, remainingCal, remainingProtein, slot }) {
  const map = Object.fromEntries(foods.map((f) => [f.id, f]));
  const pref = (id) => profile.preferences?.[id] || { score: 0, state: 'neutral' };
  const mealPref = (id) => profile.mealPreferences?.[id] || { score: 0, state: 'neutral' };

  return MEAL_IDEAS.map((idea) => {
    const items = idea.ids.map((id) => map[id]).filter(Boolean);
    if (items.length !== idea.ids.length) return null;
    if (items.some((f) => pref(f.id).state === 'disliked') || mealPref(idea.id).state === 'disliked') return null;

    const prices = items.map((f) => profile.prices?.[f.id]);
    const costKnown = prices.every((v) => v != null && Number(v) >= 0);
    const cost = costKnown ? prices.reduce((s, v) => s + Number(v), 0) : null;
    if (costKnown && cost > Math.max(0, floating)) return null;

    const cal = items.reduce((s, f) => s + Number(f.cal || 0), 0);
    const protein = items.reduce((s, f) => s + Number(f.protein || 0), 0);
    const likes = items.reduce((s, f) => s + pref(f.id).score, 0) + mealPref(idea.id).score * 2;

    // Gap fit: reward protein toward the remaining target, penalise going
    // well past the remaining calories.
    const proteinFit = remainingProtein > 0 ? Math.min(protein, remainingProtein) / remainingProtein : 0;
    const overCal = Math.max(0, cal - remainingCal - 150);
    let score = proteinFit * 10 - overCal / 100 + likes;
    if (idea.slot === slot) score += 6;

    let reason;
    if (remainingCal <= 0) reason = "You've hit today's calories — only if you're still hungry.";
    else if (remainingProtein > 0 && protein >= remainingProtein * 0.4) reason = `Covers ${Math.round(proteinFit * 100)}% of the ${Math.round(remainingProtein)}g protein you still need.`;
    else if (cal <= remainingCal) reason = `Fits the ${Math.round(remainingCal)} cal you have left today.`;
    else reason = `About ${cal - Math.round(remainingCal)} cal over today's goal.`;

    return { ...idea, items, cost, costKnown, cal, protein, score, reason };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}
