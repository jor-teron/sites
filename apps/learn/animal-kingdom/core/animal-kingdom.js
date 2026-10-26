/*
Header Comment:
animal-kingdom.js - Core JavaScript logic for the Animal Kingdom Learning WebApp Book.
Purpose: Handles navigation, chapter loading, animal display, search, and interactions.
Location: core/ folder
Project: animal-kingdom
Date: 2026-10-25
Author: Grok / Jor Teron
Notes: Loads data from modules/animal-data.js. Modular functions for readability. All-age friendly display.
*/

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the app
    initApp();
});

/**
 * Initializes the Animal Kingdom app.
 * Builds chapter navigation and sets up event listeners.
 */
function initApp() {
    buildChapterNav();
    setupSearch();
    showWelcome();
}

/**
 * Builds the chapter list in the sidebar from AnimalData.
 * Each chapter is a clickable link that loads its animals.
 */
function buildChapterNav() {
    const chapterList = document.getElementById('chapter-list');
    chapterList.innerHTML = ''; // Clear any existing

    // Loop through each chapter in AnimalData
    for (const key in window.AnimalData) {
        if (window.AnimalData.hasOwnProperty(key)) {
            const chapter = window.AnimalData[key];
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = chapter.name;
            a.dataset.chapter = key;
            a.addEventListener('click', function(e) {
                e.preventDefault();
                loadChapter(key);
                // Highlight active
                document.querySelectorAll('#chapter-list a').forEach(el => el.classList.remove('active'));
                this.classList.add('active');
            });
            li.appendChild(a);
            chapterList.appendChild(li);
        }
    }
}

/**
 * Loads and displays animals from a specific chapter.
 * @param {string} chapterKey - The key of the chapter in AnimalData.
 */
function loadChapter(chapterKey) {
    const chapter = window.AnimalData[chapterKey];
    if (!chapter) return;

    hideWelcome();
    const display = document.getElementById('animal-display');
    display.innerHTML = `<h2>${chapter.name}</h2>`;

    // Show list of animals in chapter as clickable cards or just first one for simplicity
    chapter.animals.forEach(animal => {
        const animalDiv = document.createElement('div');
        animalDiv.className = 'animal-preview';
        animalDiv.innerHTML = `
            <h3>${animal.name}</h3>
            <img src="${animal.image}" alt="${animal.name}" class="animal-image" style="max-height:200px;">
            <p>${animal.description.substring(0, 100)}...</p>
            <button onclick="showAnimal('${chapterKey}', '${animal.name}')">Read More</button>
        `;
        display.appendChild(animalDiv);
    });

    display.classList.remove('hidden');
}

/**
 * Displays full details of a single animal.
 * @param {string} chapterKey - Chapter key.
 * @param {string} animalName - Name of the animal to show.
 */
function showAnimal(chapterKey, animalName) {
    const chapter = window.AnimalData[chapterKey];
    const animal = chapter.animals.find(a => a.name === animalName);
    if (!animal) return;

    const display = document.getElementById('animal-display');
    display.innerHTML = `
        <img src="${animal.image}" alt="${animal.name}" class="animal-image">
        <h2 class="animal-name">${animal.name}</h2>
        <p class="scientific">${animal.scientific}</p>
        <p class="description">${animal.description}</p>
        <p><strong>Habitat:</strong> ${animal.habitat}</p>
        <p><strong>Diet:</strong> ${animal.diet}</p>
        <div class="fun-facts">
            <h3>Fun Facts</h3>
            <ul>
                ${animal.funFacts.map(fact => `<li>${fact}</li>`).join('')}
            </ul>
        </div>
        <button onclick="loadChapter('${chapterKey}')">Back to ${chapter.name}</button>
    `;
}

/**
 * Sets up the search input to filter animals across chapters.
 */
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', function() {
        const query = this.value.toLowerCase().trim();
        if (query.length < 2) {
            showWelcome();
            return;
        }
        searchAnimals(query);
    });
}

/**
 * Searches all animals and displays matching results.
 * @param {string} query - Search term.
 */
function searchAnimals(query) {
    hideWelcome();
    const display = document.getElementById('animal-display');
    display.innerHTML = `<h2>Search Results for "${query}"</h2>`;
    let found = false;

    for (const key in window.AnimalData) {
        const chapter = window.AnimalData[key];
        chapter.animals.forEach(animal => {
            if (animal.name.toLowerCase().includes(query) || 
                animal.description.toLowerCase().includes(query) ||
                animal.scientific.toLowerCase().includes(query)) {
                found = true;
                const div = document.createElement('div');
                div.innerHTML = `
                    <h3>${animal.name} (${chapter.name})</h3>
                    <img src="${animal.image}" alt="${animal.name}" class="animal-image" style="max-height:150px;">
                    <p>${animal.description}</p>
                    <button onclick="showAnimal('${key}', '${animal.name}')">View Full</button>
                `;
                display.appendChild(div);
            }
        });
    }

    if (!found) {
        display.innerHTML += '<p>No animals found. Try another word.</p>';
    }
    display.classList.remove('hidden');
}

/**
 * Shows the welcome page.
 */
function showWelcome() {
    document.getElementById('welcome-page').classList.remove('hidden');
    document.getElementById('animal-display').classList.add('hidden');
}

/**
 * Hides the welcome page.
 */
function hideWelcome() {
    document.getElementById('welcome-page').classList.add('hidden');
}

// Expose functions globally for onclick handlers
window.showAnimal = showAnimal;
window.loadChapter = loadChapter;
