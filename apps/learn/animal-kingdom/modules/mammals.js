/*
Header Comment:
mammals.js - Chapter module for Mammals in Animal Kingdom Learning WebApp Book.
Purpose: Provides structured data (images + text) for mammal animals.
Location: modules/ folder
Project: animal-kingdom
Date: 2026-10-25
Author: Grok / Jor Teron
Notes: Adds data to global AnimalData. Easy to extend with more mammals.
*/

// Ensure global AnimalData exists
if (typeof window.AnimalData === 'undefined') {
    window.AnimalData = {};
}

// Mammals chapter data
window.AnimalData.mammals = {
    name: "Mammals",
    animals: [
        {
            name: "Lion",
            scientific: "Panthera leo",
            image: "assets/mammals/lion.jpg",
            description: "The lion is a big cat known as the king of the jungle. It lives in groups called prides and has a loud roar.",
            funFacts: ["Males have manes.", "They can sleep up to 20 hours a day.", "Lions are found in Africa and a small group in India."],
            habitat: "Savannas and grasslands",
            diet: "Carnivore"
        },
        {
            name: "Elephant",
            scientific: "Loxodonta africana",
            image: "assets/mammals/elephant.jpg",
            description: "Elephants are the largest land animals. They have long trunks and big ears. They are very smart and live in herds.",
            funFacts: ["An elephant's trunk has over 40,000 muscles.", "They can live up to 70 years.", "Baby elephants are called calves."],
            habitat: "Forests and savannas",
            diet: "Herbivore"
        }
    ]
};
