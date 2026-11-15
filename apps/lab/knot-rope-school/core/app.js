// Application state, rendering, navigation and interactions.
const { lessons, knotSvg, figureEightTutorial } = window.KRS;

const state = {
  view: "home",
  activeLesson: null,
  visualStep: 0,
  completed: JSON.parse(localStorage.getItem("krs-completed") || "[]")
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];



function card(lesson) {
  const done = state.completed.includes(lesson.id);
  return `<button class="lesson-card" data-open-lesson="${lesson.id}">
    <div class="card-art">${knotSvg(lesson.drawing)}</div>
    <div class="card-body">
      <div class="card-topline"><span>LESSON ${lesson.number}</span><span>${done ? '<span class="done-mark">✓ COMPLETED</span>' : lesson.difficulty}</span></div>
      <h3>${lesson.name}</h3><p>${lesson.short}</p>
      <div class="card-link"><span>${done ? "Review lesson" : "Explore lesson"}</span><span aria-hidden="true">↗</span></div>
    </div>
  </button>`;
}

function renderCards() {
  $("#home-lessons").innerHTML = lessons.map(card).join("");
  $("#all-lessons").innerHTML = lessons.map(card).join("");
}

function showView(view) {
  state.view = view;
  ["home", "lessons", "lesson", "practice"].forEach(name => {
    const section = document.getElementById(name + "-view");
    if (section) section.hidden = name !== view;
  });
  $$(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.view === view || (view === "lesson" && tab.dataset.view === "lessons")));
  window.scrollTo({top: 0, behavior: "smooth"});
  if (view === "practice") renderPractice();
}

function openLesson(id) {
  const lesson = lessons.find(item => item.id === id);
  if (!lesson) return;
  state.activeLesson = id;
  state.visualStep = 0;
  $("#lesson-content").innerHTML = `
    <div class="lesson-header">
      <div><p class="eyebrow">LESSON ${lesson.number} · ${lesson.difficulty.toUpperCase()}</p><h1>${lesson.name}</h1><p>${lesson.short}</p></div>
    </div>
    <div class="lesson-columns">
      <div>
        <section class="content-section"><h2>What is it for?</h2><p>${lesson.use}</p></section>
        <section class="content-section"><h2>How to tie it</h2>${lesson.id === "figure-eight" ? figureEightTutorial(state.visualStep) : `<ol class="steps">${lesson.steps.map(step => `<li>${step}</li>`).join("")}</ol>`}</section>
        <section class="content-section"><h2>Check your knot</h2><p>Look at the finished shape. The strands should lie neatly together without crossing in an unintended way. Tighten it gradually by hand and inspect both the knot and the rope.</p></section>
        <div class="quiz">
          <p class="eyebrow">QUICK CHECK</p><h3>${lesson.question}</h3>
          <div>${lesson.options.map((option, i) => `<label class="quiz-option"><input type="radio" name="quiz" value="${i}"> ${option}</label>`).join("")}</div>
          <button class="button button-dark" data-action="check-quiz">Check answer</button>
          <p id="quiz-feedback" class="quiz-feedback" role="status"></p>
        </div>
        <div class="lesson-actions">
          <button class="button button-dark" data-action="complete-lesson">${state.completed.includes(id) ? "Completed ✓" : "Mark lesson complete"}</button>
          <button class="text-button" data-action="back-to-lessons">Back to lessons</button>
        </div>
      </div>
      <aside>
        <div class="side-card"><h3>Practice rope</h3><p>${lesson.rope}</p></div>
        <div class="side-card"><h3>Common mistakes</h3><ul>${lesson.mistakes.map(item => `<li>${item}</li>`).join("")}</ul></div>
        <div class="side-card"><h3>Untying</h3><p>${lesson.untie}</p></div>
        <div class="side-card"><h3>Practice challenge</h3><p>Tie it three times slowly. After each attempt, compare the shape and check that the knot is dressed neatly.</p></div>
      </aside>
    </div>`;
  showView("lesson");
}

function renderPractice() {
  $("#completed-count").textContent = state.completed.length;
  $("#practice-list").innerHTML = lessons.map(lesson => `
    <div class="practice-row"><label><input type="checkbox" data-complete="${lesson.id}" ${state.completed.includes(lesson.id) ? "checked" : ""}><span>${lesson.name}</span></label><span class="card-topline">${state.completed.includes(lesson.id) ? "DONE ✓" : "NOT YET"}</span></div>
  `).join("");
  $("#practice-notes").value = localStorage.getItem("krs-notes") || "";
}

function setCompleted(id, checked) {
  state.completed = checked ? [...new Set([...state.completed, id])] : state.completed.filter(item => item !== id);
  localStorage.setItem("krs-completed", JSON.stringify(state.completed));
  renderCards();
  if (state.view === "practice") renderPractice();
}

document.addEventListener("click", event => {
  const tutorialButton = event.target.closest("[data-tutorial-step]");
  if (tutorialButton && state.activeLesson === "figure-eight") {
    state.visualStep = Math.max(0, Math.min(4, state.visualStep + (tutorialButton.dataset.tutorialStep === "next" ? 1 : -1)));
    const tutorial = $(".visual-tutorial");
    if (tutorial) tutorial.outerHTML = figureEightTutorial(state.visualStep);
    return;
  }
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) return showView(viewButton.dataset.view);
  const viewLink = event.target.closest("[data-view-link]");
  if (viewLink) return showView(viewLink.dataset.viewLink);
  const lessonButton = event.target.closest("[data-open-lesson]");
  if (lessonButton) return openLesson(lessonButton.dataset.openLesson);
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "start-learning") showView("lessons");
  if (action === "back-to-lessons") showView("lessons");
  if (action === "complete-lesson" && state.activeLesson) {
    setCompleted(state.activeLesson, true);
    const button = $('[data-action="complete-lesson"]');
    if (button) button.textContent = "Completed ✓";
  }
  if (action === "check-quiz" && state.activeLesson) {
    const lesson = lessons.find(item => item.id === state.activeLesson);
    const selected = $('input[name="quiz"]:checked');
    $("#quiz-feedback").textContent = !selected ? "Choose an answer first." : Number(selected.value) === lesson.answer ? lesson.explanation : "Not quite. Try again and think about the knot's main purpose.";
  }
});

document.addEventListener("change", event => {
  if (event.target.matches("[data-complete]")) setCompleted(event.target.dataset.complete, event.target.checked);
});

$("#save-notes").addEventListener("click", () => {
  localStorage.setItem("krs-notes", $("#practice-notes").value);
  $("#save-status").textContent = "Saved on this device.";
});

renderCards();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}
