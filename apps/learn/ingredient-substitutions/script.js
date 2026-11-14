const substitutionsData = [
    {
        id: "ginger",
        name: "Fresh Ginger",
        category: "Aromatics",
        alternatives: [
            {
                name: "Ground Dry Ginger Powder (Sonth)",
                ratio: "1/4 tsp powder per 1 tbsp fresh ginger",
                note: "Powder is more concentrated and pungent. Great for curries and teas, but lacks the fresh fibrous bite."
            },
            {
                name: "Allspice or Cinnamon + Nutmeg",
                ratio: "A small pinch to taste",
                note: "Works reasonably well in baked goods or sweet spiced preparations, but not ideal for savory stir-fries."
            },
            {
                name: "Garlic (if flavor profile allows)",
                ratio: "1:1 ratio",
                note: "Doesn't taste like ginger, but provides an aromatic punch when ginger is entirely unavailable."
            }
        ]
    },
    {
        id: "garlic",
        name: "Fresh Garlic",
        category: "Aromatics",
        alternatives: [
            {
                name: "Garlic Powder",
                ratio: "1/8 to 1/4 tsp powder per fresh clove",
                note: "Convenient pantry staple; lacks the fresh pungent kick of crushed cloves."
            },
            {
                name: "Asafoetida (Hing)",
                ratio: "A tiny pinch (less than 1/8 tsp)",
                note: "Classic Indian traditional substitute for garlic/onion in fasting (satvik) cooking. Highly pungent when cooked in oil."
            },
            {
                name: "Shallots or Green Onion bulbs",
                ratio: "1 chopped shallot or bulb per 2 cloves",
                note: "Provides a mild savory Allium flavor."
            }
        ]
    },
    {
        id: "onion",
        name: "Fresh Onion",
        category: "Aromatics",
        alternatives: [
            {
                name: "Shallots or Spring Onion Bulbs",
                ratio: "1:1 ratio",
                note: "Slightly sweeter and more delicate, but excellent direct substitute in gravies and sautés."
            },
            {
                name: "Onion Powder",
                ratio: "1 tsp powder per small onion",
                note: "Good for dry rubs and seasoning sauces when fresh onions are out of stock."
            },
            {
                name: "Asafoetida (Hing) + Cumin",
                ratio: "Pinch of hing with 1/2 tsp cumin seeds in hot oil",
                note: "Traditional base substitute that mimics the savory savory depth of onions in lentil (dal) dishes."
            }
        ]
    },
    {
        id: "tomato",
        name: "Fresh Tomatoes / Tomato Puree",
        category: "Vegetables",
        alternatives: [
            {
                name: "Tomato Paste / Ketchup",
                ratio: "1 tbsp tomato paste + 2 tbsp water per tomato",
                note: "Tomato paste is highly concentrated. Dilute with water and add a pinch of sugar for acidity balance."
            },
            {
                name: "Tamarind Pulp (Imli) or Yogurt",
                ratio: "1 tsp tamarind paste or 2 tbsp beaten curd",
                note: "If you need the sourness/tang for a curry rather than body, tamarind or yogurt works wonderfully."
            },
            {
                name: "Canned Diced Tomatoes",
                ratio: "1/2 cup canned per fresh tomato",
                note: "Stays fresh in the pantry and cooks down into gravies smoothly."
            }
        ]
    },
    {
        id: "potato",
        name: "Potatoes",
        category: "Vegetables",
        alternatives: [
            {
                name: "Sweet Potatoes / Yam (Ratalu)",
                ratio: "1:1 ratio",
                note: "Sweeter flavor profile, but excellent roasted, boiled, or curried."
            },
            {
                name: "Raw Green Bananas (Plantains)",
                ratio: "1:1 ratio",
                note: "Starchy texture when cooked; great substitute in dry spiced sabzis."
            },
            {
                name: "Turnips (Shalgam) or Radish (Mooli)",
                ratio: "1:1 ratio",
                note: "Lower starch content, but absorbs spices very well when stewed."
            }
        ]
    },
    {
        id: "jeera",
        name: "Cumin Seeds (Jeera)",
        category: "Spices",
        alternatives: [
            {
                name: "Fennel Seeds (Saunf) or Coriander Seeds (Dhania)",
                ratio: "1:1 ratio",
                note: "Fennel is sweeter (anisey), while coriander is citrusy/earthy. Both provide good seed-spice tempering."
            },
            {
                name: "Ground Cumin Powder",
                ratio: "3/4 tsp powder per 1 tsp whole seeds",
                note: "Add powder slightly later in hot oil so it doesn't burn instantly."
            },
            {
                name: "Carom Seeds (Ajwain) or Mustard Seeds",
                ratio: "Half the amount",
                note: "Pungent and sharp alternative for tempering oil (tadka)."
            }
        ]
    },
    {
        id: "curd",
        name: "Plain Yogurt / Curd (Dahi)",
        category: "Wet/Dairy",
        alternatives: [
            {
                name: "Buttermilk (Chaas) or Thin Chaas",
                ratio: "1:1 ratio (adjust flour/thickener if needed)",
                note: "Already liquid, great for gravies and marinades."
            },
            {
                name: "Milk + Lemon Juice or Vinegar",
                ratio: "1 cup milk + 1 tbsp lemon juice (let sit 5 mins)",
                note: "Curdles slightly to mimic the acidity and dairy richness needed in creamy curries."
            },
            {
                name: "Cashew Paste or Coconut Milk",
                ratio: "1/2 cup paste/milk",
                note: "Adds rich creaminess without the sour tang of curd."
            }
        ]
    }
];

const searchInput = document.getElementById('searchInput');
const substitutionGrid = document.getElementById('substitutionGrid');
const noResults = document.getElementById('noResults');
const filterChips = document.querySelectorAll('.chip');

let currentCategory = 'all';

function renderSubstitutions(query = '') {
    const searchTerm = query.toLowerCase().trim();
    
    const filtered = substitutionsData.filter(item => {
        const matchesCategory = currentCategory === 'all' || item.category === currentCategory;
        const matchesSearch = item.name.toLowerCase().includes(searchTerm) || 
            item.alternatives.some(alt => alt.name.toLowerCase().includes(searchTerm) || alt.note.toLowerCase().includes(searchTerm));
        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        substitutionGrid.innerHTML = '';
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    substitutionGrid.innerHTML = filtered.map(item => `
        <div class="card">
            <div class="card-header">
                <span class="card-title">Missing: ${item.name}</span>
                <span class="badge">${item.category}</span>
            </div>
            <div class="alternatives-list">
                ${item.alternatives.map(alt => `
                    <div class="alt-item">
                        <div class="alt-name">✨ ${alt.name}</div>
                        <div class="alt-ratio">Ratio: ${alt.ratio}</div>
                        <div class="alt-note">${alt.note}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

searchInput.addEventListener('input', (e) => {
    renderSubstitutions(e.target.value);
});

filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentCategory = chip.dataset.category;
        renderSubstitutions(searchInput.value);
    });
});

// Initial render
renderSubstitutions();
