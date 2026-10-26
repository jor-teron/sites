/*
Header Comment:
birds.js - Chapter module for Birds in Animal Kingdom Learning WebApp Book.
Purpose: Provides structured data (images + text) for bird animals.
Location: modules/ folder
Project: animal-kingdom
Date: 2026-10-25
Author: Grok / Jor Teron
Notes: Adds data to global AnimalData. Easy to extend with more birds.
*/

// Ensure global AnimalData exists
if (typeof window.AnimalData === 'undefined') {
    window.AnimalData = {};
}

// Birds chapter data
window.AnimalData.birds = {
    name: "Birds",
    animals: [
        {
            name: "Penguin",
            scientific: "Aptenodytes forsteri",
            image: "assets/birds/penguin.jpg",
            description: "Penguins are birds that cannot fly but are excellent swimmers. They live in cold places and waddle on land.",
            funFacts: ["Emperor penguins can dive over 500 meters.", "They huddle together to stay warm.", "Chicks are fluffy and grey."],
            habitat: "Antarctica and southern oceans",
            diet: "Carnivore (fish, krill)"
        },
        {
            name: "Eagle",
            scientific: "Aquila chrysaetos",
            image: "assets/birds/eagle.jpg",
            description: "Eagles are powerful birds of prey with sharp eyesight and strong talons. They soar high in the sky.",
            funFacts: ["Golden eagles can spot prey from 2 km away.", "They build huge nests called eyries.", "Some live over 30 years."],
            habitat: "Mountains and open country",
            diet: "Carnivore"
        }
    ]
};
