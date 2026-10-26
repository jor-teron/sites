/*
Header Comment:
reptiles.js - Chapter module for Reptiles in Animal Kingdom Learning WebApp Book.
Purpose: Provides structured data (images + text) for reptile animals.
Location: modules/ folder
Project: animal-kingdom
Date: 2026-10-25
Author: Grok / Jor Teron
Notes: Adds data to global AnimalData. Easy to extend with more reptiles.
*/

// Ensure global AnimalData exists
if (typeof window.AnimalData === 'undefined') {
    window.AnimalData = {};
}

// Reptiles chapter data
window.AnimalData.reptiles = {
    name: "Reptiles",
    animals: [
        {
            name: "Crocodile",
            scientific: "Crocodylus niloticus",
            image: "assets/reptiles/crocodile.jpg",
            description: "Crocodiles are large reptiles that live in water. They have powerful jaws and are ancient animals.",
            funFacts: ["They can hold their breath for over an hour.", "Baby crocs make chirping sounds.", "They are excellent parents."],
            habitat: "Rivers, lakes, wetlands",
            diet: "Carnivore"
        }
    ]
};
