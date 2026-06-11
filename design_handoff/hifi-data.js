// Plantry dish library, current week, and activity data for the hi-fi prototype.
// Images live in assets/dishes/. Paths are relative to the design_handoff folder.

(function () {
  const IMG = (k) => (window.PLANTRY_ASSET_BASE || '') + 'assets/dishes/' + k + '.jpg';

  // cook: { skill, equipment, special, recipe[] } shown inside the complexity details panel.
  const DISHES = {
    poha:         { name: 'Kanda poha', img: IMG('poha'), meal: 'Breakfast', protein: 9, pc: 0.3, time: 20, complexity: 'Easy', lastCooked: 'Last week', healthy: true,
      cook: { skill: 'Basic, one pan', equipment: 'Kadhai', special: 'Thick poha, fresh curry leaves', recipe: ['Rinse poha and let it soften.', 'Temper mustard, curry leaves, onion; add turmeric.', 'Fold in poha, finish with lemon and coriander.'] } },
    omelette:     { name: 'Masala omelette', img: IMG('masala-omelette'), meal: 'Breakfast', protein: 18, pc: 2.6, time: 15, complexity: 'Easy', lastCooked: '5 days ago', healthy: true,
      cook: { skill: 'Basic, one pan', equipment: 'Nonstick pan', special: 'None', recipe: ['Whisk eggs with onion, chilli, coriander, salt.', 'Cook on medium till set, fold and serve.'] } },
    chilla:       { name: 'Besan chilla', img: IMG('besan-chilla'), meal: 'Breakfast', protein: 14, pc: 0.8, time: 25, complexity: 'Easy', lastCooked: '2 weeks ago', healthy: true,
      cook: { skill: 'Basic, batter spreading takes one or two tries', equipment: 'Flat tawa', special: 'None', recipe: ['Whisk besan with water, ajwain, chilli and onion.', 'Spread thin on a hot tawa, drizzle oil.', 'Flip once, cook till golden.'] } },
    idli:         { name: 'Idli with sambar', img: IMG('idli-sambar'), meal: 'Breakfast', protein: 8, pc: 0.2, time: 30, complexity: 'Medium', lastCooked: '3 weeks ago', healthy: true, prep: 'Keep batter ready the day before',
      cook: { skill: 'Easy with ready batter', equipment: 'Idli steamer, pressure cooker', special: 'Idli batter, drumstick for sambar', recipe: ['Steam idlis 12 minutes.', 'Pressure cook toor dal, add sambar masala and vegetables.', 'Temper with mustard and curry leaves.'] } },
    dosa:         { name: 'Masala dosa', img: IMG('masala-dosa'), meal: 'Breakfast', protein: 7, pc: 0.2, time: 40, complexity: 'Medium', lastCooked: 'Never', healthy: false, prep: 'Batter needs an overnight ferment',
      cook: { skill: 'Spreading thin dosas takes practice', equipment: 'Cast iron or nonstick tawa', special: 'Dosa batter', recipe: ['Make potato masala with onion, turmeric, mustard.', 'Spread batter thin on a hot tawa, drizzle ghee.', 'Fill and fold when crisp.'] } },
    upma:         { name: 'Rava upma', img: IMG('upma'), meal: 'Breakfast', protein: 6, pc: 0.2, time: 20, complexity: 'Easy', lastCooked: '6 weeks ago', healthy: true,
      cook: { skill: 'Basic, one pan', equipment: 'Kadhai', special: 'None', recipe: ['Roast rava till fragrant, set aside.', 'Temper mustard, urad dal, onion, ginger.', 'Add hot water, stir in rava, rest covered.'] } },
    dalTadka:     { name: 'Dal tadka', img: IMG('dal-tadka'), meal: 'Lunch', protein: 12, pc: 0.5, time: 30, complexity: 'Easy', lastCooked: 'Last week', healthy: true,
      cook: { skill: 'Basic', equipment: 'Pressure cooker', special: 'None', recipe: ['Pressure cook toor dal with turmeric.', 'Temper ghee, cumin, garlic, red chilli.', 'Pour tadka over dal, finish with coriander.'] } },
    palakPaneer:  { name: 'Palak paneer', img: IMG('palak-paneer'), meal: 'Lunch', protein: 19, pc: 1.4, time: 35, complexity: 'Medium', lastCooked: '3 weeks ago', healthy: true,
      cook: { skill: 'Comfortable, needs blanching and a quick blend', equipment: 'Pressure cooker, mixer jar', special: 'Fresh palak, two bunches', recipe: ['Blanch palak two minutes, cool, blend smooth.', 'Saute onion, ginger, garlic, tomato; add spices and puree.', 'Simmer five minutes, fold in paneer, finish with cream.'] } },
    chickenCurry: { name: 'Home chicken curry', img: IMG('chicken-curry'), meal: 'Lunch', protein: 32, pc: 2.8, time: 45, complexity: 'Medium', lastCooked: '2 weeks ago', healthy: true,
      cook: { skill: 'Comfortable, browning matters', equipment: 'Heavy kadhai', special: 'Curry cut chicken, 600g', recipe: ['Brown onions slowly, add ginger garlic paste.', 'Add tomato and spices, cook till oil separates.', 'Add chicken, simmer covered 25 minutes.'] } },
    eggCurry:     { name: 'Egg curry', img: IMG('egg-curry'), meal: 'Lunch', protein: 16, pc: 1.6, time: 30, complexity: 'Easy', lastCooked: '4 weeks ago', healthy: true,
      cook: { skill: 'Basic', equipment: 'Kadhai', special: 'None', recipe: ['Boil eggs, halve them.', 'Make onion tomato masala with garam masala.', 'Slide eggs in, simmer five minutes.'] } },
    fishCurry:    { name: 'Fish curry', img: IMG('fish-curry'), meal: 'Lunch', protein: 28, pc: 2.4, time: 40, complexity: 'Medium', lastCooked: '2 weeks ago', healthy: true,
      cook: { skill: 'Comfortable, fish breaks if overstirred', equipment: 'Wide pan', special: 'Seer or basa, 500g; tamarind', recipe: ['Make a tamarind and onion base with curry powder.', 'Slide fish pieces in, do not stir hard.', 'Simmer eight minutes, rest before serving.'] } },
    prawnMalai:   { name: 'Prawn malai curry', img: IMG('prawn-malai'), meal: 'Lunch', protein: 24, pc: 1.8, time: 50, complexity: 'Hard', lastCooked: 'Never', healthy: false,
      cook: { skill: 'Confident, prawns overcook fast and coconut base needs patience', equipment: 'Heavy pan', special: 'Prawns 400g, thick coconut milk', recipe: ['Devein prawns, marinate in turmeric and salt.', 'Make a paste of onion, ginger; fry in ghee with whole spices.', 'Add coconut milk, simmer; add prawns for the last four minutes.'] } },
    rajma:        { name: 'Rajma', img: IMG('rajma'), meal: 'Lunch', protein: 15, pc: 0.6, time: 50, complexity: 'Medium', lastCooked: '5 weeks ago', healthy: true, prep: 'Soak rajma the night before',
      cook: { skill: 'Basic, needs overnight soak', equipment: 'Pressure cooker', special: 'Soak rajma the night before', recipe: ['Pressure cook soaked rajma till soft.', 'Cook onion tomato masala with rajma masala.', 'Combine and simmer 15 minutes till thick.'] } },
    chanaMasala:  { name: 'Chana masala', img: IMG('chana-masala'), meal: 'Lunch', protein: 14, pc: 0.5, time: 45, complexity: 'Medium', lastCooked: 'Never', healthy: true, prep: 'Soak chana the night before',
      cook: { skill: 'Basic, needs overnight soak', equipment: 'Pressure cooker', special: 'Soak chana the night before', recipe: ['Pressure cook soaked chana with tea bag for colour.', 'Make a dark onion masala with anardana.', 'Simmer chana in masala 15 minutes.'] } },
    bhindiFry:    { name: 'Bhindi fry', img: IMG('bhindi-fry'), meal: 'Lunch', protein: 4, pc: 0.4, time: 25, complexity: 'Easy', lastCooked: 'Last week', healthy: true,
      cook: { skill: 'Basic, dry the bhindi well', equipment: 'Kadhai', special: 'Fresh bhindi, 400g', recipe: ['Wash and dry bhindi fully, cut into rounds.', 'Fry on high till edges crisp.', 'Season with amchur and salt at the end.'] } },
    bhindiMasala: { name: 'Bhindi masala', img: IMG('bhindi-masala'), meal: 'Lunch', protein: 5, pc: 0.4, time: 30, complexity: 'Easy', lastCooked: '4 weeks ago', healthy: true,
      cook: { skill: 'Basic', equipment: 'Kadhai', special: 'Fresh bhindi, 400g', recipe: ['Fry bhindi separately till nearly done.', 'Make onion tomato masala.', 'Toss bhindi in masala for five minutes.'] } },
    alooGobi:     { name: 'Aloo gobi', img: IMG('aloo-gobi'), meal: 'Lunch', protein: 5, pc: 0.2, time: 30, complexity: 'Easy', lastCooked: '3 weeks ago', healthy: true,
      cook: { skill: 'Basic', equipment: 'Kadhai with lid', special: 'None', recipe: ['Saute cumin, ginger, then potato and gobi.', 'Add turmeric, coriander powder, salt.', 'Cover and cook on low till tender.'] } },
    jeeraRice:    { name: 'Jeera rice', img: IMG('jeera-rice'), meal: 'Lunch', protein: 4, pc: 0.1, time: 20, complexity: 'Easy', lastCooked: 'Last week', healthy: true,
      cook: { skill: 'Basic', equipment: 'Pot with lid', special: 'None', recipe: ['Temper cumin in ghee.', 'Add soaked rice and water, cook covered.'] } },
    chapati:      { name: 'Chapati', img: IMG('chapati'), meal: 'Lunch', protein: 6, pc: 0.2, time: 25, complexity: 'Easy', lastCooked: 'Last week', healthy: true,
      cook: { skill: 'Comfortable rolling', equipment: 'Tawa, rolling pin', special: 'None', recipe: ['Knead soft atta dough, rest 15 minutes.', 'Roll thin rounds, cook on hot tawa till puffed.'] } },
    lemonRice:    { name: 'Lemon rice', img: IMG('lemon-rice'), meal: 'Lunch', protein: 4, pc: 0.1, time: 20, complexity: 'Easy', lastCooked: 'Never', healthy: true,
      cook: { skill: 'Basic', equipment: 'Kadhai', special: 'None', recipe: ['Temper mustard, chana dal, peanuts, curry leaves.', 'Add turmeric and cooked rice.', 'Finish with lemon juice off the heat.'] } },
    curdRice:     { name: 'Curd rice', img: IMG('curd-rice'), meal: 'Lunch', protein: 8, pc: 0.4, time: 15, complexity: 'Easy', lastCooked: '2 weeks ago', healthy: true,
      cook: { skill: 'Basic', equipment: 'None special', special: 'Fresh curd', recipe: ['Mash warm rice with curd, milk and salt.', 'Temper mustard, curry leaves, ginger; mix in.'] } },
    kadhaiPaneer: { name: 'Kadhai paneer', img: IMG('kadhai-paneer'), meal: 'Lunch', protein: 20, pc: 1.5, time: 40, complexity: 'Medium', lastCooked: 'Never', healthy: true,
      cook: { skill: 'Comfortable, fresh ground masala is the point', equipment: 'Kadhai, small grinder', special: 'Paneer 250g, capsicum', recipe: ['Dry roast and crush coriander seeds and red chilli.', 'Cook onion, tomato, capsicum with the kadhai masala.', 'Fold in paneer, finish with kasuri methi.'] } },
    matarPaneer:  { name: 'Matar paneer', img: IMG('matar-paneer'), meal: 'Lunch', protein: 17, pc: 1.1, time: 35, complexity: 'Medium', lastCooked: 'Never', healthy: true,
      cook: { skill: 'Basic gravy work', equipment: 'Kadhai, mixer jar', special: 'Paneer 250g, green peas', recipe: ['Blend a smooth onion tomato gravy.', 'Simmer with garam masala, add peas.', 'Add paneer cubes for the last five minutes.'] } },
    vegPulao:     { name: 'Vegetable pulao', img: IMG('veg-pulao'), meal: 'Lunch', protein: 7, pc: 0.2, time: 35, complexity: 'Easy', lastCooked: '6 weeks ago', healthy: true,
      cook: { skill: 'Basic', equipment: 'Pot with lid', special: 'None', recipe: ['Saute whole spices and vegetables.', 'Add soaked basmati and water, cook covered.'] } },
    dalMakhani:   { name: 'Dal makhani', img: IMG('dal-makhani'), meal: 'Lunch', protein: 13, pc: 0.6, time: 60, complexity: 'Hard', lastCooked: 'Never', healthy: false, prep: 'Soak whole urad the night before',
      cook: { skill: 'Patient, long slow simmer is the dish', equipment: 'Pressure cooker, heavy pot', special: 'Whole urad, soak overnight; cream', recipe: ['Pressure cook soaked urad and rajma till very soft.', 'Simmer with butter, tomato puree and spices for 40 minutes.', 'Finish with cream, rest before serving.'] } },
  };

  // One line descriptions, shown under the dish name in details.
  const DESC = {
    poha: 'Flattened rice tossed with onion, curry leaves and lemon',
    omelette: 'Eggs whisked with onion, chilli and coriander',
    chilla: 'Savoury gram flour pancakes with ajwain',
    idli: 'Steamed rice cakes with a vegetable sambar',
    dosa: 'Crisp rice crepe around a spiced potato filling',
    upma: 'Soft roasted rava with mustard and ginger',
    dalTadka: 'Toor dal finished with a ghee and garlic tadka',
    palakPaneer: 'Paneer cubes in a smooth spinach gravy',
    chickenCurry: 'Everyday curry built on slow browned onions',
    eggCurry: 'Boiled eggs in an onion tomato masala',
    fishCurry: 'Gently simmered fish in a tangy tamarind base',
    prawnMalai: 'Prawns in a rich coconut milk gravy',
    rajma: 'Kidney beans simmered till thick and creamy',
    chanaMasala: 'Chana in a dark, tangy onion masala',
    bhindiFry: 'Crisp fried okra with amchur',
    bhindiMasala: 'Okra tossed in onion tomato masala',
    alooGobi: 'Dry potato and cauliflower with turmeric',
    jeeraRice: 'Basmati tempered with cumin in ghee',
    chapati: 'Soft whole wheat flatbreads',
    lemonRice: 'Rice with lemon, peanuts and curry leaves',
    curdRice: 'Cooling curd rice with a mustard tempering',
    kadhaiPaneer: 'Paneer and capsicum in a fresh ground kadhai masala',
    matarPaneer: 'Paneer and peas in a smooth tomato gravy',
    vegPulao: 'Basmati cooked with whole spices and vegetables',
    dalMakhani: 'Whole urad simmered long with butter and cream',
  };
  Object.keys(DESC).forEach((k) => { if (DISHES[k]) DISHES[k].desc = DESC[k]; });

  // Plain language complexity, used everywhere the user sees it.
  const COMPLEXITY_LABELS = { Easy: 'Easy to cook', Medium: 'Cook will need some help', Hard: 'Takes time and effort' };

  // Week of June 15 to 20. Entry: { key, includeRecipe } or { custom: name, includeRecipe }.
  const WEEK = [
    { id: 'mon', day: 'Monday', short: 'Mon', date: 15,
      breakfast: [{ key: 'poha' }, { key: 'omelette' }], lunch: [{ key: 'dalTadka' }, { key: 'bhindiFry' }, { key: 'chapati' }] },
    { id: 'tue', day: 'Tuesday', short: 'Tue', date: 16,
      breakfast: [{ key: 'chilla' }], lunch: [{ key: 'chickenCurry' }, { key: 'jeeraRice' }, { key: 'alooGobi' }, { key: 'curdRice' }] },
    { id: 'wed', day: 'Wednesday', short: 'Wed', date: 17,
      breakfast: [{ key: 'idli' }, { key: 'omelette' }], lunch: [{ key: 'palakPaneer', includeRecipe: true }, { key: 'lemonRice' }, { key: 'bhindiMasala' }] },
    { id: 'thu', day: 'Thursday', short: 'Thu', date: 18,
      breakfast: [{ key: 'upma' }], lunch: [{ key: 'fishCurry' }, { key: 'vegPulao' }, { key: 'curdRice' }, { key: 'chapati' }] },
    { id: 'fri', day: 'Friday', short: 'Fri', date: 19,
      breakfast: [{ key: 'poha' }, { key: 'chilla' }], lunch: [{ key: 'eggCurry' }, { key: 'jeeraRice' }, { key: 'bhindiFry' }] },
    { id: 'sat', day: 'Saturday', short: 'Sat', date: 20,
      breakfast: [], lunch: [{ key: 'rajma' }, { key: 'chapati' }, { key: 'alooGobi' }] },
  ];

  // Explore: dishes never cooked, with a short reason they fit this household.
  const EXPLORE_WHY = {
    kadhaiPaneer: 'You cook paneer most weeks; this one is new',
    matarPaneer: 'Close to your usual paneer gravies',
    chanaMasala: 'Fits your high protein lunches',
    prawnMalai: 'You like prawns; this is a weekend dish',
    dosa: 'A change from idli mornings',
    lemonRice: 'Quick rice change from jeera rice',
    dalMakhani: 'A slow Sunday style dal',
  };

  // Grocery list, fixed group order. Tracked items round up to pack multiples.
  const GROCERY = [
    { group: 'Proteins and Dairy', items: ['Eggs, 12', 'Paneer, 250g', 'Chicken, curry cut, 600g', 'Fish, seer or basa, 500g', 'Curd, 1kg', 'Milk, 1L'] },
    { group: 'Pantry', items: ['Poha, thick, 500g', 'Besan, 500g', 'Toor dal, 500g', 'Rajma, 250g', 'Idli batter, 1kg', 'Basmati rice, 1kg'] },
    { group: 'Vegetables', items: ['Onion, 2kg', 'Tomato, 1.5kg', 'Bhindi, 800g', 'Palak, 2 bunches', 'Cauliflower, 1', 'Potato, 1kg', 'Green peas, 250g'] },
    { group: 'Aromatics and Herbs', items: ['Ginger, 200g', 'Garlic, 200g', 'Coriander, 3 bunches', 'Curry leaves, 2 sprigs', 'Green chilli, 100g', 'Lemon, 6'] },
    { group: 'Other', items: ['Coconut milk, 400ml', 'Tamarind, 100g'] },
  ];

  const ACTIVITY = [
    { who: 'Tuhina', text: 'Swapped Wednesday lunch to palak paneer', when: '2h ago', reason: 'Palak is fresh at the market' },
    { who: 'Rajat', text: 'Commented on Thursday', when: 'Yesterday', reason: '' },
  ];

  window.PlantryData = { DISHES, WEEK, EXPLORE_WHY, GROCERY, ACTIVITY, COMPLEXITY_LABELS };
})();
