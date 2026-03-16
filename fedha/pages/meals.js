import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import TransactionModal from '../compobackgroundnents/TransactionModal';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatShort } from '../lib/utils';

// ─── MEAL TIERS BASED ON DAILY FOOD BUDGET ───────────────────────────────────
// We suggest spending 20% of floating cash on food for the day, capped sensibly

const MEAL_PLANS = {
  tight: {
    label: 'Budget Mode',
    range: 'Under KSh 200/day',
    color: '#F59E0B',
    description: 'Nutritious meals that cost very little but still give you protein and energy to build strength.',
    days: [
      {
        day: 'Monday', budget: 180,
        meals: [
          { time: 'Breakfast', name: 'Uji wa Wimbi + 2 Boiled Eggs', ingredients: 'Millet flour, milk, 2 eggs', cost: 35, cal: 520, protein: '22g', tip: 'Add peanut butter to your uji for extra 100 calories' },
          { time: '10am', name: 'Banana + Groundnuts', ingredients: '2 bananas, handful groundnuts', cost: 20, cal: 280, protein: '7g', tip: 'Roasted groundnuts are 26g protein per 100g — best cheap protein in Kenya' },
          { time: 'Lunch', name: 'Ugali + Beans + Sukuma', ingredients: 'Maize flour, dry beans, sukuma wiki, tomatoes, onions', cost: 60, cal: 780, protein: '28g', tip: 'Cook beans with a full onion and 2 tomatoes for flavor. Big ugali portion' },
          { time: 'Dinner', name: 'Sweet Potato + Scrambled Eggs', ingredients: '3 sweet potatoes, 3 eggs, onions, tomatoes, oil', cost: 55, cal: 650, protein: '19g', tip: 'Sweet potato before bed gives you slow-release carbs for overnight muscle recovery' },
        ]
      },
      {
        day: 'Tuesday', budget: 175,
        meals: [
          { time: 'Breakfast', name: 'Mandazi + Peanut Butter + Chai', ingredients: 'Mandazi, peanut butter, tea leaves, milk, sugar', cost: 40, cal: 580, protein: '14g', tip: 'Spread peanut butter generously — do not be shy with it' },
          { time: '10am', name: 'Avocado on Bread', ingredients: '2 slices bread, 1 ripe avocado, salt', cost: 30, cal: 340, protein: '6g', tip: 'Avocado has healthy fat that helps absorb vitamins — great for gaining good weight' },
          { time: 'Lunch', name: 'Ugali + Chicken Liver + Cabbage', ingredients: 'Chicken liver, maize flour, cabbage, onions, oil, spices', cost: 70, cal: 820, protein: '38g', tip: 'Liver is the most nutritious cheap food — iron, B12, protein all in one' },
          { time: 'Dinner', name: 'Githeri + Potatoes', ingredients: 'Maize, beans, potatoes, carrots, onions', cost: 45, cal: 700, protein: '22g', tip: 'Githeri is a complete protein — your body uses it as well as meat' },
        ]
      },
      {
        day: 'Wednesday', budget: 190,
        meals: [
          { time: 'Breakfast', name: 'Rice + Milk Porridge + Eggs', ingredients: 'Rice, milk, sugar, peanut butter, 2 eggs', cost: 45, cal: 640, protein: '24g', tip: 'Simmer leftover rice in milk for a high-calorie breakfast porridge' },
          { time: '10am', name: 'Boiled Groundnuts', ingredients: 'Cup of groundnuts, salt, water', cost: 15, cal: 320, protein: '14g', tip: 'Boiling groundnuts instead of roasting keeps more nutrients intact' },
          { time: 'Lunch', name: 'Rice + Omena Stew + Sukuma', ingredients: 'Rice, omena (dagaa), tomatoes, onions, oil, sukuma', cost: 65, cal: 780, protein: '36g', tip: 'Omena is the most protein-dense cheap food in Kenya. Fry it crispy for best taste' },
          { time: 'Dinner', name: 'Ugali + Beans + Fried Egg', ingredients: 'Maize flour, beans, 2 eggs, oil', cost: 55, cal: 720, protein: '30g', tip: 'Drink a glass of milk before bed if possible — best thing for overnight muscle repair' },
        ]
      },
      {
        day: 'Thursday', budget: 200,
        meals: [
          { time: 'Breakfast', name: 'Mahamri + Chai ya Maziwa', ingredients: 'Mahamri, tea, full milk, sugar', cost: 40, cal: 560, protein: '10g', tip: 'Full milk chai gives you protein and fat — better than weak tea with little milk' },
          { time: '10am', name: '3 Boiled Eggs + Banana', ingredients: '3 eggs, 2 bananas', cost: 35, cal: 380, protein: '19g', tip: 'Eggs are the highest quality protein you can get. 3 eggs = muscle fuel' },
          { time: 'Lunch', name: 'Ugali + Beef Offcuts Stew', ingredients: 'KSh 40 beef/offcuts, ugali, tomatoes, onions, hoho', cost: 90, cal: 880, protein: '42g', tip: 'Offcuts and bones from the butcher are cheap and very high in protein and collagen' },
          { time: 'Dinner', name: 'Mukimo + Egg', ingredients: 'Sweet potato, green peas, spinach, egg', cost: 50, cal: 650, protein: '22g', tip: 'Mukimo packs carbs and greens together — very efficient one-pot meal' },
        ]
      },
      {
        day: 'Friday', budget: 185,
        meals: [
          { time: 'Breakfast', name: 'Uji + Peanut Butter + 2 Eggs', ingredients: 'Millet flour, milk, peanut butter, 2 eggs', cost: 45, cal: 680, protein: '30g', tip: 'This breakfast gives you enough protein for 3 hours of strong focus or work' },
          { time: '10am', name: 'Sweet Potatoes + Glass of Milk', ingredients: '2 sweet potatoes, 1 glass milk', cost: 30, cal: 360, protein: '9g', tip: 'Sweet potato + milk is one of the best snack combos for muscle growth' },
          { time: 'Lunch', name: 'Pilau + Side Beans', ingredients: 'Rice, pilau masala, onions, oil, beans', cost: 75, cal: 820, protein: '28g', tip: 'Make pilau with the bean water for extra flavor and nutrition' },
          { time: 'Dinner', name: 'Ugali + Fried Tilapia + Sukuma', ingredients: 'Small tilapia or omena patties, ugali, sukuma, lemon', cost: 80, cal: 760, protein: '40g', tip: 'Fish twice a week speeds up muscle building significantly. Fry it whole' },
        ]
      },
      {
        day: 'Saturday', budget: 200,
        meals: [
          { time: 'Breakfast', name: 'Chapati + 3 Scrambled Eggs + Chai', ingredients: '3 chapati, 3 eggs, tea, milk', cost: 65, cal: 780, protein: '28g', tip: 'Saturday chapati — make them with a little extra oil so they are richer and more filling' },
          { time: '10am', name: 'Groundnuts + Banana', ingredients: 'Cup groundnuts, 2 bananas', cost: 25, cal: 380, protein: '12g', tip: 'Best pre-workout snack if you are exercising on the weekend' },
          { time: 'Lunch', name: 'Ugali + Kuku + Vegetables', ingredients: 'Chicken piece, ugali, tomatoes, onions, hoho, spices', cost: 120, cal: 920, protein: '48g', tip: 'Saturday treat meal. Eat a big portion — this fuels your whole weekend' },
          { time: 'Dinner', name: 'Rice + Beans + Avocado', ingredients: 'Rice, beans, avocado, salt, lemon', cost: 60, cal: 740, protein: '26g', tip: 'Avocado fat helps absorb all the vitamins from your beans better' },
        ]
      },
      {
        day: 'Sunday', budget: 190,
        meals: [
          { time: 'Breakfast', name: 'Uji + Boiled Eggs + Fruit', ingredients: 'Millet, milk, 3 eggs, banana or pawpaw', cost: 55, cal: 720, protein: '32g', tip: 'Best relaxed breakfast of the week. Take your time eating it' },
          { time: '10am', name: 'PB Bread + Cold Milk', ingredients: '2 bread slices, peanut butter, 1 glass cold milk', cost: 35, cal: 520, protein: '16g', tip: 'Peanut butter + milk is 500 calories in 5 minutes. Best easy weight gain combo' },
          { time: 'Lunch', name: 'Githeri + Beef + Vegetables', ingredients: 'Githeri, beef offcuts, carrots, potatoes, spices', cost: 100, cal: 920, protein: '44g', tip: 'Cook extra for Monday lunch. Best time to cook big and save money and gas' },
          { time: 'Dinner', name: 'Ugali + Fried Eggs + Leftover', ingredients: 'Ugali, 3 eggs, any leftovers, oil', cost: 45, cal: 680, protein: '28g', tip: 'Drink full glass of milk before sleeping. Sets up your muscles for the whole week' },
        ]
      },
    ]
  },
  comfortable: {
    label: 'Comfortable',
    range: 'KSh 300–600/day',
    color: '#3B82F6',
    description: 'Better variety, more protein, more flavor. Real gains without going overboard.',
    days: [
      {
        day: 'Monday', budget: 400,
        meals: [
          { time: 'Breakfast', name: 'French Toast + Eggs + Juice', ingredients: '4 bread slices, 3 eggs, milk, sugar, fresh OJ or mango juice', cost: 80, cal: 720, protein: '28g', tip: 'Dip bread in egg+milk mixture before frying — tastes like mandazi but more protein' },
          { time: '10am', name: 'Yogurt + Banana + Groundnuts', ingredients: '1 cup yogurt, 2 bananas, groundnuts', cost: 60, cal: 420, protein: '14g', tip: 'Yogurt has live cultures that improve gut health and nutrient absorption' },
          { time: 'Lunch', name: 'Rice + Beef Stew + Kachumbari + Avocado', ingredients: 'Rice, beef, tomatoes, onions, hoho, avocado, lemon', cost: 160, cal: 980, protein: '52g', tip: 'Eat a large plate. This is your main muscle-building meal of the day' },
          { time: 'Dinner', name: 'Ugali + Omena + Sukuma + Egg', ingredients: 'Ugali, omena, sukuma, 2 eggs, oil, spices', cost: 90, cal: 820, protein: '44g', tip: 'Omena + egg together gives you a complete amino acid profile for muscle repair overnight' },
        ]
      },
      {
        day: 'Tuesday', budget: 380,
        meals: [
          { time: 'Breakfast', name: 'Oatmeal + Milk + Peanut Butter + Eggs', ingredients: 'Oats, full milk, peanut butter, 2 fried eggs, banana', cost: 90, cal: 820, protein: '34g', tip: 'Oats keep you full for 4 hours. This is a gym-quality breakfast for KSh 90' },
          { time: '10am', name: 'Boiled Eggs + Fruit', ingredients: '3 boiled eggs, any seasonal fruit', cost: 45, cal: 340, protein: '19g', tip: 'Pre-boil a week of eggs on Sunday — easiest protein snack with zero prep time' },
          { time: 'Lunch', name: 'Ugali + Chicken Thighs + Cabbage Salad', ingredients: 'Chicken thighs, ugali, cabbage, carrots, lemon dressing', cost: 160, cal: 1020, protein: '56g', tip: 'Chicken thighs have more fat and flavor than breast — and cost less' },
          { time: 'Dinner', name: 'Mukimo + Beef + Kachumbari', ingredients: 'Sweet potato, peas, spinach, beef, tomatoes, onions, chili', cost: 120, cal: 860, protein: '40g', tip: 'Mukimo + meat is one of the most balanced Kenyan meals you can make' },
        ]
      },
      {
        day: 'Wednesday', budget: 420,
        meals: [
          { time: 'Breakfast', name: 'Chapati + Beef Stew + Chai', ingredients: '3 chapati, leftover beef stew, full milk chai', cost: 100, cal: 880, protein: '36g', tip: 'Using stew leftovers for breakfast means zero food waste and a very filling morning' },
          { time: '10am', name: 'Smoothie — Banana + Milk + PB', ingredients: '2 bananas, 1 glass milk, 2 tbsp peanut butter, sugar', cost: 55, cal: 520, protein: '16g', tip: 'Blend or just mash and stir — this is a homemade weight gainer shake for KSh 55' },
          { time: 'Lunch', name: 'Pilau + Kachumbari + Chicken', ingredients: 'Rice, pilau masala, chicken pieces, tomatoes, onions, lemon', cost: 180, cal: 1040, protein: '52g', tip: 'Wednesday pilau — make it fragrant with extra masala and cook slowly' },
          { time: 'Dinner', name: 'Ugali + Tilapia + Sukuma + Avocado', ingredients: 'Ugali, whole tilapia, sukuma, avocado, lemon', cost: 140, cal: 880, protein: '48g', tip: 'Whole fried tilapia is one of the best value meals you can get in Kenya' },
        ]
      },
      {
        day: 'Thursday', budget: 390,
        meals: [
          { time: 'Breakfast', name: 'Eggs Benedict Style (Kenyan)', ingredients: '3 eggs, bread, avocado, tomato, salt, pepper, tea', cost: 85, cal: 740, protein: '28g', tip: 'Poach or fry eggs over avocado toast — high protein high fat powerhouse breakfast' },
          { time: '10am', name: 'Groundnuts + Yogurt', ingredients: 'Cup groundnuts, 1 cup yogurt', cost: 50, cal: 420, protein: '18g', tip: 'Yogurt with groundnuts is a protein snack that also supports digestion' },
          { time: 'Lunch', name: 'Githeri + Beef + Avocado Salad', ingredients: 'Githeri, beef chunks, avocado, tomato, onion, lemon', cost: 150, cal: 980, protein: '46g', tip: 'Githeri with beef is arguably the most complete Kenyan meal nutritionally' },
          { time: 'Dinner', name: 'Fried Rice + Chicken Liver + Vegetables', ingredients: 'Rice, chicken liver, mixed veg, eggs, oil, soy sauce', cost: 100, cal: 840, protein: '42g', tip: 'Fried rice is very filling. The liver gives you iron which helps transport oxygen to muscles' },
        ]
      },
      {
        day: 'Friday', budget: 450,
        meals: [
          { time: 'Breakfast', name: 'Uji + 3 Eggs + Mandazi', ingredients: 'Uji ya wimbi with milk, 3 fried eggs, 2 mandazi', cost: 80, cal: 820, protein: '34g', tip: 'Big Friday breakfast to power through the day. Add peanut butter to the uji' },
          { time: '10am', name: 'Fruit Salad + Milk', ingredients: 'Banana, mango, pawpaw, 1 glass cold milk', cost: 70, cal: 380, protein: '8g', tip: 'Vitamin C from fruit helps absorb the iron from all your meat this week' },
          { time: 'Lunch', name: 'Ugali + Whole Grilled Chicken + Coleslaw', ingredients: 'Quarter chicken grilled, ugali, cabbage, carrot, lemon dressing', cost: 200, cal: 1100, protein: '62g', tip: 'Friday treat. Grilling instead of frying reduces oil but keeps full protein' },
          { time: 'Dinner', name: 'Coconut Rice + Fish + Spinach', ingredients: 'Rice cooked in coconut milk, fish, spinach, garlic', cost: 150, cal: 880, protein: '44g', tip: 'Coconut rice makes everything taste better and adds healthy saturated fat for hormones' },
        ]
      },
      {
        day: 'Saturday', budget: 500,
        meals: [
          { time: 'Breakfast', name: 'Full Kenyan Breakfast', ingredients: 'Chapati, 3 eggs (any style), sausage or liver, chai, juice', cost: 150, cal: 1020, protein: '42g', tip: 'Weekend breakfast. Take your time. This is the meal that sets your mood for the day' },
          { time: '10am', name: 'Smoothie + Groundnuts', ingredients: 'Banana, milk, peanut butter, oats blended. Groundnuts on side', cost: 70, cal: 580, protein: '20g', tip: 'Best homemade weight gainer you can make — gym supplement equivalent for KSh 70' },
          { time: 'Lunch', name: 'Nyama Choma + Ugali + Kachumbari', ingredients: 'Goat/beef ribs, ugali, tomatoes, onions, chili, lemon', cost: 250, cal: 1200, protein: '68g', tip: 'Eat the bones too or suck the marrow — bone marrow is the ultimate muscle food' },
          { time: 'Dinner', name: 'Biryani + Raita', ingredients: 'Basmati rice, chicken, biryani spices, yogurt, cucumber', cost: 180, cal: 920, protein: '44g', tip: 'Saturday biryani. Cook it slowly. The yogurt raita helps digestion after a heavy day of eating' },
        ]
      },
      {
        day: 'Sunday', budget: 450,
        meals: [
          { time: 'Breakfast', name: 'Pancakes + Eggs + Fruit + Chai', ingredients: 'Flour, eggs, milk, banana, seasonal fruit, honey', cost: 110, cal: 840, protein: '28g', tip: 'Add an egg to the pancake batter — doubles the protein without changing the taste' },
          { time: '10am', name: 'Yogurt + Granola + Banana', ingredients: 'Yogurt, oats toasted with honey, banana, groundnuts', cost: 75, cal: 480, protein: '16g', tip: 'Homemade granola (toast oats in a pan with honey) tastes way better than store bought' },
          { time: 'Lunch', name: 'Kuku Kienyeji + Pilau + Salad', ingredients: 'Free range chicken, pilau rice, green salad, avocado', cost: 250, cal: 1140, protein: '60g', tip: 'Local chicken has more protein and flavor than broiler. Worth the extra cost once a week' },
          { time: 'Dinner', name: 'Ugali + Beans + Fried Tilapia + Avocado', ingredients: 'Ugali, beans, tilapia, avocado, sukuma', cost: 140, cal: 900, protein: '46g', tip: 'End the week right. Drink milk before bed for overnight recovery going into Monday' },
        ]
      },
    ]
  },
  good: {
    label: 'Eating Well',
    range: 'KSh 700–1,200/day',
    color: '#10B981',
    description: 'Maximum nutrition, variety and taste. Full muscle-building diet with the best Kenyan ingredients.',
    days: [
      {
        day: 'Monday', budget: 900,
        meals: [
          { time: 'Breakfast', name: 'Omelette + Avocado Toast + Smoothie', ingredients: '4 eggs, hoho, onions, cheese, 2 avocado toast, banana milk PB smoothie', cost: 200, cal: 980, protein: '44g', tip: 'A 4-egg omelette with vegetables is what serious athletes eat for breakfast' },
          { time: '10am', name: 'Protein Snack Plate', ingredients: 'Boiled eggs, groundnuts, yogurt, fruit', cost: 120, cal: 520, protein: '28g', tip: 'This snack plate alone has more protein than most peoples full day' },
          { time: 'Lunch', name: 'Grilled Chicken + Rice + Salad + Avocado', ingredients: 'Chicken breast, basmati rice, lettuce, tomato, avocado, lemon dressing', cost: 350, cal: 1120, protein: '68g', tip: 'Grilled chicken breast is the gold standard for clean muscle building protein' },
          { time: 'Dinner', name: 'Beef Stew + Ugali + Sukuma + Kachumbari', ingredients: 'Quality beef, ugali, sukuma, tomatoes, onions, hoho, lemon', cost: 280, cal: 1000, protein: '56g', tip: 'Eat until comfortably full. At this budget you should be gaining 0.5–1kg per week' },
        ]
      },
      { day: 'Tuesday', budget: 950, meals: [
        { time: 'Breakfast', name: 'Full English (Kenyan Style)', ingredients: '4 eggs, 2 sausages, beans, avocado, toast, strong chai', cost: 220, cal: 1020, protein: '48g', tip: 'Kenyan sausages are cheaper and bigger than supermarket ones — buy from a butcher' },
        { time: '10am', name: 'Banana Peanut Butter Smoothie', ingredients: '3 bananas, 3 tbsp PB, 1 cup milk, oats, honey', cost: 90, cal: 680, protein: '20g', tip: 'This is a homemade mass gainer shake — same as what gym supplement brands sell for 10x the price' },
        { time: 'Lunch', name: 'Goat Meat + Ugali + Kachumbari + Greens', ingredients: 'Goat meat, ugali, fresh kachumbari, bhajia or spinach', cost: 380, cal: 1180, protein: '72g', tip: 'Goat is leaner than beef and has excellent amino acid profile for muscle building' },
        { time: 'Dinner', name: 'Coconut Fish Curry + Rice', ingredients: 'Tilapia, coconut milk, curry spices, basmati rice, lemon', cost: 250, cal: 920, protein: '52g', tip: 'Coconut milk adds healthy fat and makes the fish curry very creamy and satisfying' },
      ]},
      { day: 'Wednesday', budget: 880, meals: [
        { time: 'Breakfast', name: 'Uji Drink + Egg Chapati Roll', ingredients: 'Wimbi uji with milk and honey, egg chapati with avocado and tomato inside', cost: 160, cal: 880, protein: '36g', tip: 'Egg chapati roll is the ultimate Kenyan protein wrap — add avocado for healthy fats' },
        { time: '10am', name: 'Mixed Nuts + Yogurt + Honey', ingredients: 'Groundnuts, cashews, yogurt, honey, banana', cost: 110, cal: 520, protein: '18g', tip: 'Cashews have zinc which boosts testosterone — helps with muscle building' },
        { time: 'Lunch', name: 'Chicken Biryani + Raita + Salad', ingredients: 'Chicken, basmati, biryani spices, yogurt, cucumber, mint', cost: 320, cal: 1080, protein: '58g', tip: 'Biryani is one of the most complete meals — carbs, protein, fats and spices all in one' },
        { time: 'Dinner', name: 'Tilapia + Ugali + Avocado + Sukuma', ingredients: 'Whole tilapia, ugali, avocado, sukuma wiki, lemon', cost: 280, cal: 960, protein: '54g', tip: 'Eat the whole fish including the head — fish brain and eyes are full of omega-3' },
      ]},
      { day: 'Thursday', budget: 920, meals: [
        { time: 'Breakfast', name: 'Shakshuka + Bread + Juice', ingredients: '4 eggs poached in tomato sauce with hoho, chili, spices. Bread, fresh juice', cost: 180, cal: 820, protein: '38g', tip: 'Shakshuka is Middle Eastern but uses all Kenyan ingredients. Try it — it is excellent' },
        { time: '10am', name: 'Greek Yogurt + Groundnuts + Mango', ingredients: '1 cup full-fat yogurt, groundnuts, fresh mango, honey', cost: 100, cal: 480, protein: '20g', tip: 'Full-fat yogurt has 3x more protein than low-fat. Never buy low-fat for muscle building' },
        { time: 'Lunch', name: 'Beef Githeri + Salad + Avocado', ingredients: 'Githeri, quality beef chunks, avocado, tomato, cucumber salad', cost: 320, cal: 1100, protein: '62g', tip: 'Githeri with beef is the most nutritionally complete Kenyan meal you can make' },
        { time: 'Dinner', name: 'Lamb Ribs + Ugali + Roasted Vegetables', ingredients: 'Lamb ribs, ugali, roasted sweet potato, carrots, hoho', cost: 340, cal: 1060, protein: '60g', tip: 'Thursday dinner treat. Lamb ribs have the best ratio of protein to fat for muscle building' },
      ]},
      { day: 'Friday', budget: 1000, meals: [
        { time: 'Breakfast', name: 'Pancake Stack + Eggs + Fruit + Smoothie', ingredients: '4 thick pancakes, 3 eggs, fresh fruit salad, banana milk smoothie', cost: 200, cal: 1000, protein: '40g', tip: 'Friday big breakfast to power through the last work day and set up a great weekend' },
        { time: '10am', name: 'Protein Smoothie', ingredients: '3 bananas, 3 tbsp PB, 1 cup milk, 2 eggs, oats, honey', cost: 100, cal: 720, protein: '28g', tip: 'Adding raw eggs to a smoothie is safe and doubles the protein. Blend well' },
        { time: 'Lunch', name: 'Nyama Choma + Ugali + Kachumbari + Avocado', ingredients: 'Goat/beef, ugali, full kachumbari, avocado, roasted hoho', cost: 420, cal: 1280, protein: '76g', tip: 'Friday nyama choma is a Kenyan institution. Eat a big portion — you have earned it' },
        { time: 'Dinner', name: 'Prawn / Calamari + Coconut Rice + Salad', ingredients: 'Prawns or calamari, coconut rice, fresh salad, lemon, garlic butter', cost: 350, cal: 980, protein: '52g', tip: 'Seafood is an excellent change from chicken and beef — gives you different amino acids' },
      ]},
      { day: 'Saturday', budget: 1100, meals: [
        { time: 'Breakfast', name: 'Big Kenyan Brunch', ingredients: 'Chapati, 4 eggs, sausages, liver, avocado, chai, juice', cost: 280, cal: 1200, protein: '56g', tip: 'Saturday brunch is the best meal of the week. Cook slowly, eat slowly, enjoy it' },
        { time: '10am', name: 'Mass Gainer Smoothie', ingredients: 'Banana, milk, oats, PB, honey, egg, cocoa powder', cost: 110, cal: 780, protein: '26g', tip: 'This smoothie has more calories than most store-bought weight gainers and costs KSh 110' },
        { time: 'Lunch', name: 'Full Kuku Kienyeji + Pilau + Salad + Avocado', ingredients: 'Half local chicken, pilau, green salad, 2 avocados', cost: 500, cal: 1400, protein: '84g', tip: 'This is a complete muscle-building feast. The best Saturday lunch in Kenya' },
        { time: 'Dinner', name: 'Beef Stir Fry + Coconut Rice + Vegetables', ingredients: 'Beef strips, basmati in coconut milk, broccoli, hoho, garlic, ginger', cost: 320, cal: 1040, protein: '60g', tip: 'Ginger and garlic reduce inflammation and help muscles recover faster' },
      ]},
      { day: 'Sunday', budget: 980, meals: [
        { time: 'Breakfast', name: 'French Toast + Eggs + Avocado + Juice', ingredients: 'Thick bread, 4 eggs, 2 avocados, fresh OJ, honey', cost: 220, cal: 1020, protein: '44g', tip: 'Sunday breakfast should be the most relaxed and most enjoyable meal of the week' },
        { time: '10am', name: 'Fruit Platter + Yogurt + Groundnuts', ingredients: 'Mango, pawpaw, banana, pineapple, full yogurt, groundnuts', cost: 130, cal: 560, protein: '16g', tip: 'Vitamin C from fresh fruit helps repair muscle tissue and absorb iron from the week' },
        { time: 'Lunch', name: 'Sunday Roast (Kenyan Style)', ingredients: 'Roasted chicken, ugali, roasted sweet potato, kachumbari, avocado', cost: 400, cal: 1300, protein: '72g', tip: 'Rub the chicken with garlic, ginger, lemon and spices before roasting. Game changer' },
        { time: 'Dinner', name: 'Light Soup + Bread + Eggs', ingredients: 'Tomato and onion soup with spices, 2 bread slices, 2 fried eggs', cost: 120, cal: 640, protein: '24g', tip: 'Light Sunday dinner after a big lunch. Drink milk before bed to close out the week strong' },
      ]},
    ]
  }
};

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default function MealsPage() {
  const { wallets, budgets, loans, currency } = useApp();
  const [activeDay, setActiveDay] = useState(0);
  const [showTxn, setShowTxn] = useState(false);

  // Calculate floating cash
  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance || 0), 0);
  const totalBudgeted = budgets.reduce((s, b) => s + Math.max(0, Number(b.allocated || 0) - Number(b.spent || 0)), 0);
  const totalOwed = loans.filter((l) => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount || 0), 0);
  const floating = Math.max(0, totalBalance - totalBudgeted - totalOwed);

  // Suggest daily food budget as 15% of floating cash, max out at 1200
  const suggestedFoodBudget = Math.min(1200, floating * 0.15);

  // Pick tier based on suggested food budget
  const tier = suggestedFoodBudget >= 700 ? 'good' : suggestedFoodBudget >= 300 ? 'comfortable' : 'tight';
  const plan = MEAL_PLANS[tier];
  const dayPlan = plan.days[activeDay];

  const totalCal = dayPlan.meals.reduce((s, m) => s + m.cal, 0);
  const totalCost = dayPlan.meals.reduce((s, m) => s + m.cost, 0);
  const totalProtein = dayPlan.meals.reduce((s, m) => s + parseInt(m.protein), 0);

  const canAfford = floating >= totalCost;

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        <div className="page-header">
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Meal Planner 🍽️</h1>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
            Based on your KSh {Math.round(floating).toLocaleString()} floating cash
          </div>

          {/* Budget tier indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: `${plan.color}12`, border: `1px solid ${plan.color}30`, borderRadius: 12, marginBottom: 16 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: plan.color, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: plan.color }}>{plan.label} — {plan.range}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{plan.description}</div>
            </div>
          </div>

          {/* Can I afford today */}
          <div style={{ padding: '10px 14px', background: canAfford ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${canAfford ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 10, fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-2)' }}>Today's food budget</span>
            <span className="font-num" style={{ fontWeight: 700, color: canAfford ? 'var(--green)' : 'var(--red)' }}>
              {canAfford ? '✓' : '⚠'} KSh {totalCost} / KSh {Math.round(suggestedFoodBudget)}
            </span>
          </div>

          {/* Day selector */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {DAYS.map((d, i) => (
              <button key={d} className={`chip ${activeDay === i ? 'active' : ''}`} onClick={() => setActiveDay(i)} style={{ flexShrink: 0 }}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '0 20px' }}>
          {/* Daily stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Calories', value: totalCal.toLocaleString(), unit: 'kcal', color: '#F59E0B' },
              { label: 'Protein', value: `~${totalProtein}g`, unit: '/day', color: '#3B82F6' },
              { label: 'Cost', value: `KSh ${totalCost}`, unit: '/day', color: plan.color },
            ].map((s) => (
              <div key={s.label} className="card-2" style={{ padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.unit}</div>
              </div>
            ))}
          </div>

          {/* Meal cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {dayPlan.meals.map((meal, i) => (
              <div key={i} className="card" style={{ padding: '16px', borderLeft: `3px solid ${plan.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 11, color: plan.color, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>{meal.time}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{meal.name}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="font-num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>KSh {meal.cost}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{meal.cal} cal · {meal.protein} protein</div>
                  </div>
                </div>

                <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-2)' }}>Ingredients: </span>{meal.ingredients}
                </div>

                <div style={{ background: 'var(--card-2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, display: 'flex', gap: 8 }}>
                  <span style={{ color: plan.color, flexShrink: 0 }}>💡</span>
                  <span>{meal.tip}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Weekly grocery tip */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>Weekly Shopping Tip</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
              Buy in bulk on Sundays — beans (1kg), groundnuts (500g), unga (2kg), eggs (tray of 30), peanut butter (1 jar). Buying daily costs you 25–40% more. Cook big batches and refrigerate — saves time, gas and money.
            </div>
          </div>

          {/* Muscle building notes */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>For Weight + Muscle Gain</div>
            {[
              '🥚 Eat more than you feel like — your body is used to less right now. Force feed a little.',
              '🥜 Add peanut butter to everything — uji, bread, smoothies. 1 jar = +10,000 cheap calories.',
              '🥛 Drink a full glass of milk before bed every night — overnight muscle repair.',
              '🍌 Groundnuts + banana is the cheapest high-calorie snack in Kenya. Eat it daily.',
              '🏋️ Even 20 pushups + 20 squats daily triples how fast you gain muscle from food.',
            ].map((tip, i) => (
              <div key={i} style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8, lineHeight: 1.5 }}>{tip}</div>
            ))}
          </div>
        </div>
      </div>

      {showTxn && <TransactionModal onClose={() => setShowTxn(false)} />}
    </Layout>
  );
}
