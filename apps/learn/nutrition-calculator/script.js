// Comprehensive Food Database (per 100g standard or unit as specified)
const foodDatabase = [
    {
        id: 'chicken_breast',
        name: 'Chicken Breast (cooked)',
        category: 'protein',
        serving: '100g',
        cals: 165,
        protein: 31.0,
        carbs: 0.0,
        fat: 3.6,
        vitamins: { 'B6': 0.6, 'B3': 13.7, 'Selenium': 27.6 }
    },
    {
        id: 'salmon',
        name: 'Atlantic Salmon (cooked)',
        category: 'protein',
        serving: '100g',
        cals: 206,
        protein: 22.1,
        carbs: 0.0,
        fat: 12.3,
        vitamins: { 'B12': 3.2, 'D': 11.0, 'Selenium': 36.5, 'Omega-3': 2.2 }
    },
    {
        id: 'eggs',
        name: 'Whole Eggs (large)',
        category: 'protein',
        serving: '1 egg (50g)',
        cals: 72,
        protein: 6.3,
        carbs: 0.4,
        fat: 4.8,
        vitamins: { 'B12': 0.6, 'D': 1.0, 'Choline': 147, 'A': 80 }
    },
    {
        id: 'greek_yogurt',
        name: 'Greek Yogurt (plain, low-fat)',
        category: 'dairy',
        serving: '100g',
        cals: 73,
        protein: 10.0,
        carbs: 3.6,
        fat: 2.0,
        vitamins: { 'B12': 0.75, 'Calcium': 110, 'Phosphorus': 135 }
    },
    {
        id: 'tofu',
        name: 'Firm Tofu',
        category: 'protein',
        serving: '100g',
        cals: 83,
        protein: 10.0,
        carbs: 2.0,
        fat: 5.0,
        vitamins: { 'Calcium': 350, 'Iron': 5.4, 'Manganese': 0.6 }
    },
    {
        id: 'lentils',
        name: 'Lentils (cooked)',
        category: 'protein',
        serving: '100g',
        cals: 116,
        protein: 9.0,
        carbs: 20.0,
        fat: 0.4,
        vitamins: { 'Folate': 181, 'Iron': 3.3, 'Potassium': 369, 'Fiber': 7.9 }
    },
    {
        id: 'spinach',
        name: 'Spinach (raw)',
        category: 'veg',
        serving: '100g',
        cals: 23,
        protein: 2.9,
        carbs: 3.6,
        fat: 0.4,
        vitamins: { 'A': 469, 'C': 28.1, 'K': 483, 'Iron': 2.7, 'Folate': 194 }
    },
    {
        id: 'broccoli',
        name: 'Broccoli (steamed)',
        category: 'veg',
        serving: '100g',
        cals: 35,
        protein: 2.4,
        carbs: 7.2,
        fat: 0.4,
        vitamins: { 'C': 64.9, 'K': 102, 'Folate': 108, 'Fiber': 3.3 }
    },
    {
        id: 'sweet_potato',
        name: 'Sweet Potato (baked)',
        category: 'grain',
        serving: '100g',
        cals: 90,
        protein: 2.0,
        carbs: 20.7,
        fat: 0.2,
        vitamins: { 'A': 961, 'C': 19.6, 'Potassium': 475, 'B6': 0.2 }
    },
    {
        id: 'avocado',
        name: 'Avocado',
        category: 'fruit',
        serving: '100g',
        cals: 160,
        protein: 2.0,
        carbs: 8.5,
        fat: 14.7,
        vitamins: { 'K': 21, 'E': 2.1, 'C': 10, 'Potassium': 485, 'Fiber': 6.7 }
    },
    {
        id: 'banana',
        name: 'Banana',
        category: 'fruit',
        serving: '1 medium (118g)',
        cals: 105,
        protein: 1.3,
        carbs: 27.0,
        fat: 0.3,
        vitamins: { 'C': 10.3, 'B6': 0.4, 'Potassium': 422, 'Magnesium': 32 }
    },
    {
        id: 'blueberries',
        name: 'Blueberries',
        category: 'fruit',
        serving: '100g',
        cals: 57,
        protein: 0.7,
        carbs: 14.5,
        fat: 0.3,
        vitamins: { 'C': 9.7, 'K': 19.3, 'Manganese': 0.3, 'Fiber': 2.4 }
    },
    {
        id: 'brown_rice',
        name: 'Brown Rice (cooked)',
        category: 'grain',
        serving: '100g',
        cals: 112,
        protein: 2.6,
        carbs: 23.5,
        fat: 0.9,
        vitamins: { 'Magnesium': 43, 'Phosphorus': 83, 'Selenium': 10.8 }
    },
    {
        id: 'oats',
        name: 'Rolled Oats (dry)',
        category: 'grain',
        serving: '100g',
        cals: 389,
        protein: 16.9,
        carbs: 66.3,
        fat: 6.9,
        vitamins: { 'Iron': 4.7, 'Magnesium': 177, 'Zinc': 4.0, 'Fiber': 10.6 }
    },
    {
        id: 'almonds',
        name: 'Almonds',
        category: 'dairy', // fats category
        serving: '30g (~23 almonds)',
        cals: 164,
        protein: 6.0,
        carbs: 6.1,
        fat: 14.2,
        vitamins: { 'E': 7.3, 'Magnesium': 76, 'Calcium': 76, 'Riboflavin': 0.3 }
    },
    {
        id: 'olive_oil',
        name: 'Olive Oil',
        category: 'dairy', // fats category
        serving: '1 tbsp (14g)',
        cals: 119,
        protein: 0.0,
        carbs: 0.0,
        fat: 13.5,
        vitamins: { 'E': 2.0, 'K': 8.1 }
    }
];

// Daily Recommended Reference Values (approximate adult target for percentages)
const dailyReference = {
    'A': 900, // mcg RAE
    'C': 90,  // mg
    'D': 15,  // mcg
    'E': 15,  // mg
    'K': 120, // mcg
    'B6': 1.7, // mg
    'B12': 2.4, // mcg
    'Iron': 18, // mg
    'Calcium': 1000, // mg
    'Potassium': 3400, // mg
    'Magnesium': 420, // mg
    'Fiber': 28 // g
};

// Current Meal Basket state: { foodId: quantityMultiplier }
let currentMeal = {};

// Preset Meals
const presets = {
    breakfast: { 'eggs': 2, 'avocado': 1.5, 'banana': 1 },
    chicken_rice: { 'chicken_breast': 1.5, 'brown_rice': 1.5, 'broccoli': 1 },
    smoothie: { 'spinach': 1, 'greek_yogurt': 1.5, 'blueberries': 1, 'oats': 0.5 }
};

// DOM Elements
const foodListEl = document.getElementById('foodList');
const basketItemsEl = document.getElementById('basketItems');
const foodSearchEl = document.getElementById('foodSearch');
const categoryFiltersEl = document.getElementById('categoryFilters');

const totalCaloriesEl = document.getElementById('totalCalories');
const totalProteinEl = document.getElementById('totalProtein');
const totalCarbsEl = document.getElementById('totalCarbs');
const totalFatEl = document.getElementById('totalFat');
const vitaminListEl = document.getElementById('vitaminList');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    renderFoodDatabase();
    renderMealBasket();
    setupEventListeners();
});

function setupEventListeners() {
    foodSearchEl.addEventListener('input', renderFoodDatabase);

    categoryFiltersEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            renderFoodDatabase();
        }
    });
}

function renderFoodDatabase() {
    const query = foodSearchEl.value.toLowerCase();
    const activeCategory = document.querySelector('.filter-btn.active').dataset.category;

    const filtered = foodDatabase.filter(food => {
        const matchesQuery = food.name.toLowerCase().includes(query);
        const matchesCat = activeCategory === 'all' || food.category === activeCategory;
        return matchesQuery && matchesCat;
    });

    if (filtered.length === 0) {
        foodListEl.innerHTML = `<div class="empty-state">No matching foods found.</div>`;
        return;
    }

    foodListEl.innerHTML = filtered.map(food => `
        <div class="food-item" onclick="addFood('${food.id}')">
            <div class="food-info">
                <h4>${food.name}</h4>
                <p>${food.serving} • ${food.cals} kcal | ${food.protein}g protein</p>
            </div>
            <div class="food-add-hint">+</div>
        </div>
    `).join('');
}

function addFood(foodId) {
    if (currentMeal[foodId]) {
        currentMeal[foodId] += 1;
    } else {
        currentMeal[foodId] = 1;
    }
    renderMealBasket();
}

function updateQty(foodId, delta) {
    if (currentMeal[foodId]) {
        currentMeal[foodId] += delta;
        if (currentMeal[foodId] <= 0) {
            delete currentMeal[foodId];
        }
    }
    renderMealBasket();
}

function removeItem(foodId) {
    delete currentMeal[foodId];
    renderMealBasket();
}

function clearMeal() {
    currentMeal = {};
    renderMealBasket();
}

function loadPreset(presetKey) {
    currentMeal = { ...presets[presetKey] };
    renderMealBasket();
}

function renderMealBasket() {
    const keys = Object.keys(currentMeal);

    if (keys.length === 0) {
        basketItemsEl.innerHTML = `<div class="empty-state">No foods added yet. Click items from the database.</div>`;
        updateSummary();
        return;
    }

    basketItemsEl.innerHTML = keys.map(foodId => {
        const food = foodDatabase.find(f => f.id === foodId);
        const qty = currentMeal[foodId];
        const cals = Math.round(food.cals * qty);
        const protein = (food.protein * qty).toFixed(1);

        return `
            <div class="basket-item">
                <div class="basket-item-info">
                    <h5>${food.name}</h5>
                    <p>${cals} kcal • ${protein}g protein</p>
                </div>
                <div class="basket-item-controls">
                    <div class="qty-controls">
                        <button class="qty-btn" onclick="updateQty('${foodId}', -0.5)">-</button>
                        <span class="qty-val">${qty}x</span>
                        <button class="qty-btn" onclick="updateQty('${foodId}', 0.5)">+</button>
                    </div>
                    <button class="remove-item-btn" onclick="removeItem('${foodId}')" title="Remove">&times;</button>
                </div>
            </div>
        `;
    }).join('');

    updateSummary();
}

function updateSummary() {
    let totals = { cals: 0, protein: 0, carbs: 0, fat: 0 };
    let vitaminsAccumulator = {};

    Object.keys(currentMeal).forEach(foodId => {
        const food = foodDatabase.find(f => f.id === foodId);
        const qty = currentMeal[foodId];

        totals.cals += food.cals * qty;
        totals.protein += food.protein * qty;
        totals.carbs += food.carbs * qty;
        totals.fat += food.fat * qty;

        if (food.vitamins) {
            Object.keys(food.vitamins).forEach(vit => {
                vitaminsAccumulator[vit] = (vitaminsAccumulator[vit] || 0) + (food.vitamins[vit] * qty);
            });
        }
    });

    totalCaloriesEl.textContent = Math.round(totals.cals);
    totalProteinEl.textContent = totals.protein.toFixed(1);
    totalCarbsEl.textContent = totals.carbs.toFixed(1);
    totalFatEl.textContent = totals.fat.toFixed(1);

    // Render Vitamins
    const vitKeys = Object.keys(vitaminsAccumulator);
    if (vitKeys.length === 0) {
        vitaminListEl.innerHTML = `<li class="vitamin-item"><span style="color:var(--text-muted)">Add foods to view vitamin and mineral intake.</span></li>`;
        return;
    }

    vitaminListEl.innerHTML = vitKeys.map(vit => {
        const val = vitaminsAccumulator[vit];
        const ref = dailyReference[vit] || 100;
        const pct = Math.min(Math.round((val / ref) * 100), 100);
        
        let unit = 'mg';
        if (['A', 'D', 'K', 'B12', 'Selenium'].includes(vit)) unit = 'mcg';
        if (vit === 'Omega-3') unit = 'g';

        return `
            <li class="vitamin-item">
                <div class="vitamin-info">
                    <span><strong>${vit}</strong>: ${val >= 10 ? Math.round(val) : val.toFixed(1)}${unit}</span>
                </div>
                <div style="display:flex; align-items:center;">
                    <span style="font-size:0.75rem; color:var(--text-muted); width:35px; text-align:right;">${pct}%</span>
                    <div class="vitamin-bar-container">
                        <div class="vitamin-bar" style="width: ${pct}%"></div>
                    </div>
                </div>
            </li>
        `;
    }).join('');
}
