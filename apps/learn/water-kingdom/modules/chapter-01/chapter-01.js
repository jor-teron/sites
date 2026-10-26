/*
  Water Kingdom - Children's Learning App
  modules/chapter-01/chapter-01.js - Chapter 1 data module
  Project: water-kingdom
  Contains all page content for "Meet Droppy".
  Exposes window.chapter1 for the main controller.
  Future chapters follow the same pattern.
*/

// Chapter 1 page data array
// Each page has: title (optional), illustration (emoji or text), text, extra (optional), theme class
window.chapter1 = {
  name: "Meet Droppy",
  pages: [
    {
      title: "Water Kingdom",
      illustration: "🌊",
      text: "Chapter 1",
      extra: "Meet Droppy",
      theme: "theme-welcome"
    },
    {
      title: "Hello!",
      illustration: "💧",
      illustrationClass: "drop-character",
      text: "I am Droppy the water drop.",
      extra: "Nice to meet you!",
      theme: "theme-welcome"
    },
    {
      title: "The Water Kingdom",
      illustration: "🗺️",
      text: "This is my home.",
      extra: "It has oceans, rivers, clouds and ice.",
      theme: "theme-welcome"
    },
    {
      title: "The Big Ocean",
      illustration: "🌊",
      text: "So much water!",
      extra: "Fish and whales live here.",
      theme: "theme-ocean"
    },
    {
      title: "Sparkling Rivers",
      illustration: "🏞️",
      text: "Rivers flow and flow.",
      extra: "They carry water to the ocean.",
      theme: "theme-river"
    },
    {
      title: "Fluffy Clouds",
      illustration: "☁️",
      text: "Clouds are made of tiny drops.",
      extra: "Just like me!",
      theme: "theme-cloud"
    },
    {
      title: "Cold Ice",
      illustration: "🧊",
      text: "Ice is frozen water.",
      extra: "It lives high in the mountains.",
      theme: "theme-ice"
    },
    {
      title: "Let's Explore!",
      illustration: "💧✨",
      text: "Come with me on an adventure.",
      extra: "More chapters coming soon!",
      theme: "theme-welcome"
    }
  ]
};
