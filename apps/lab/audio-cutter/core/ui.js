/*
  Project: Audio Cutter
  File: core/ui.js
  Description: UI events and controls for the audio cutter.
  Date: 2026-11-11
*/

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const controls = document.getElementById("controls");
const startSlider = document.getElementById("start");
const endSlider = document.getElementById("end");
const timeInfo = document.getElementById("timeInfo");
const playBtn = document.getElementById("playBtn");
const exportBtn = document.getElementById("exportBtn");
const audioEl = document.getElementById("audio");
const status = document.getElementById("status");

let duration = 0;

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", e => {
  e.preventDefault();
  dropZone.style.borderColor = "#333";
});

dropZone.addEventListener("dragleave", () => {
  dropZone.style.borderColor = "#ccc";
});

dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.style.borderColor = "#ccc";
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

async function handleFile(file) {
  status.textContent = "Loading...";
  try {
    duration = await loadAudio(file);
    startSlider.max = duration;
    endSlider.max = duration;
    endSlider.value = duration;
    updateTimeInfo();
    controls.hidden = false;
    status.textContent = file.name + " loaded";
  } catch (err) {
    status.textContent = "Error loading audio";
  }
}

function updateTimeInfo() {
  const s = parseFloat(startSlider.value);
  const e = parseFloat(endSlider.value);
  timeInfo.textContent = s.toFixed(1) + "s – " + e.toFixed(1) + "s";
}

startSlider.addEventListener("input", () => {
  if (parseFloat(startSlider.value) > parseFloat(endSlider.value))
    startSlider.value = endSlider.value;
  updateTimeInfo();
});

endSlider.addEventListener("input", () => {
  if (parseFloat(endSlider.value) < parseFloat(startSlider.value))
    endSlider.value = startSlider.value;
  updateTimeInfo();
});

playBtn.addEventListener("click", () => {
  if (!audioBuffer) return;
  const start = parseFloat(startSlider.value);
  const end = parseFloat(endSlider.value);
  const cut = cutAudio(start, end);
  if (!cut) return;

  const blob = bufferToWav(cut);
  const url = URL.createObjectURL(blob);
  audioEl.src = url;
  audioEl.hidden = false;
  audioEl.play();
});

exportBtn.addEventListener("click", () => {
  const start = parseFloat(startSlider.value);
  const end = parseFloat(endSlider.value);
  const blob = exportCut(start, end);
  if (!blob) return;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cut.wav";
  a.click();
  status.textContent = "Exported cut.wav";
});
