/*
  Project: Todo
  File: script.js
  Description: Todo list logic. Tasks and background color saved in localStorage.
  Date: 2026-11-11
*/

const STORAGE_KEY = "todo_tasks";
const COLOR_KEY = "todo_bg";

const form = document.getElementById("addForm");
const input = document.getElementById("taskInput");
const list = document.getElementById("taskList");
const colorBtns = document.querySelectorAll(".color-btn");

let tasks = [];

// Load saved tasks and color on start
function load() {
  const saved = localStorage.getItem(STORAGE_KEY);
  tasks = saved ? JSON.parse(saved) : [];

  const savedColor = localStorage.getItem(COLOR_KEY);
  if (savedColor) {
    document.body.style.background = savedColor;
    colorBtns.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.color === savedColor);
    });
  }

  render();
}

// Save tasks to localStorage
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// Render the task list
function render() {
  list.innerHTML = "";
  tasks.forEach((task, i) => {
    const li = document.createElement("li");
    if (task.done) li.classList.add("done");

    li.innerHTML = `
      <input type="checkbox" ${task.done ? "checked" : ""} data-index="${i}">
      <span>${task.text}</span>
      <button class="delete" data-index="${i}">×</button>
    `;
    list.appendChild(li);
  });
}

// Add new task
form.addEventListener("submit", e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  tasks.push({ text, done: false });
  input.value = "";
  save();
  render();
});

// Toggle done or delete
list.addEventListener("click", e => {
  const i = e.target.dataset.index;
  if (i === undefined) return;

  if (e.target.type === "checkbox") {
    tasks[i].done = !tasks[i].done;
  } else if (e.target.classList.contains("delete")) {
    tasks.splice(i, 1);
  }
  save();
  render();
});

// Change background color
colorBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const color = btn.dataset.color;
    document.body.style.background = color;
    localStorage.setItem(COLOR_KEY, color);

    colorBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

load();
