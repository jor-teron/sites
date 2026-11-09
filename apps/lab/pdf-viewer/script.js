const PDFJS_CMAP_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/";

const fileInput = document.getElementById("file-input");
const viewer = document.getElementById("viewer");
const placeholder = document.getElementById("placeholder");
const controls = document.getElementById("controls");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const pageInput = document.getElementById("page-input");
const pageCount = document.getElementById("page-count");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomLabel = document.getElementById("zoom-label");
const printBtn = document.getElementById("print-btn");
const nativeLink = document.getElementById("native-link");

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

const state = {
  doc: null,
  file: null,
  objectUrl: null, // blob: URL of the loaded file, used for native open
  pageNumber: 1,
  zoom: 1,
  scale: 1,
  canvas: null,
  ctx: null,
  rendering: false,
  pending: null,
};

// Point the worker at the CDN; same version as the main pdf.js bundle.
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* ---------- File loading ---------- */

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const buffer = await file.arrayBuffer();

  try {
    const doc = await pdfjsLib.getDocument({
      data: buffer,
      cMapUrl: PDFJS_CMAP_URL,
      cMapPacked: true,
    }).promise;

    state.doc = doc;
    state.file = file;
    state.pageNumber = 1;
    state.zoom = 1;

    // Size the canvas from the first page so page 1 renders at a sensible scale.
    const firstPage = await doc.getPage(1);
    state.scale = computeFitScale(firstPage);

    // Blob URL so the PDF can be handed to the browser's own PDF viewer.
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = URL.createObjectURL(file);
    nativeLink.href = state.objectUrl;
    nativeLink.hidden = false;

    placeholder.hidden = true;
    controls.hidden = false;
    pageCount.textContent = doc.numPages;
    pageInput.max = doc.numPages;

    await mountCanvas(firstPage);
    renderCurrentPage();
    updateUi();
  } catch (error) {
    console.error("Failed to open PDF:", error);
    placeholder.hidden = false;
    placeholder.textContent = "Could not open this file. Is it a valid PDF?";
    controls.hidden = true;
    nativeLink.hidden = true;
    state.doc = null;
  } finally {
    // Allow re-selecting the same file later.
    fileInput.value = "";
  }
});

/* ---------- Canvas + rendering ---------- */

function computeFitScale(page) {
  const unscaled = page.getViewport({ scale: 1 });
  const available = viewer.clientWidth - 32; // padding allowance
  if (available <= 0) return 1;
  return Math.min(available / unscaled.width, 1.5);
}

async function mountCanvas(page) {
  if (state.canvas) {
    state.canvas.remove();
  }

  const viewport = page.getViewport({ scale: state.scale * state.zoom });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  viewer.appendChild(canvas);

  state.canvas = canvas;
  state.ctx = canvas.getContext("2d");
}

async function renderCurrentPage() {
  if (!state.doc) return;

  const page = await state.doc.getPage(state.pageNumber);
  const viewport = page.getViewport({ scale: state.scale * state.zoom });

  const canvas = state.canvas;
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  // Cancel any in-flight render before starting a new one.
  if (state.rendering) {
    state.pending = { page, viewport };
    return;
  }

  state.rendering = true;
  const task = page.render({ canvasContext: state.ctx, viewport });

  try {
    await task.promise;
  } catch (error) {
    if (error && error.name !== "RenderingCancelledException") {
      console.error("Render failed:", error);
    }
  } finally {
    state.rendering = false;
    if (state.pending) {
      const next = state.pending;
      state.pending = null;
      if (next.page.pageNumber === state.pageNumber) {
        renderCurrentPage();
      }
    }
  }

  updateUi();
}

/* ---------- Print ---------- */

// Print the current page with the browser's print dialog. The canvas is
// temporarily stretched to full page width via the print stylesheet.
printBtn.addEventListener("click", () => {
  if (!state.doc || !state.canvas) return;
  window.print();
});

/* ---------- UI ---------- */

function updateUi() {
  if (!state.doc) return;

  pageInput.value = state.pageNumber;
  prevBtn.disabled = state.pageNumber <= 1;
  nextBtn.disabled = state.pageNumber >= state.doc.numPages;
  zoomLabel.textContent = Math.round(state.zoom * 100) + "%";
  zoomInBtn.disabled = state.zoom >= ZOOM_MAX;
  zoomOutBtn.disabled = state.zoom <= ZOOM_MIN;
  printBtn.title = "Print page " + state.pageNumber;
}

function goToPage(number) {
  if (!state.doc) return;
  const target = Math.min(Math.max(1, number), state.doc.numPages);
  if (target === state.pageNumber) return;
  state.pageNumber = target;
  renderCurrentPage();
}

function setZoom(zoom) {
  const next = Math.min(Math.max(ZOOM_MIN, zoom), ZOOM_MAX);
  if (next === state.zoom) return;
  state.zoom = next;
  renderCurrentPage();
}

/* ---------- Events ---------- */

prevBtn.addEventListener("click", () => goToPage(state.pageNumber - 1));
nextBtn.addEventListener("click", () => goToPage(state.pageNumber + 1));

pageInput.addEventListener("change", () => {
  goToPage(parseInt(pageInput.value, 10) || 1);
});

zoomInBtn.addEventListener("click", () => setZoom(state.zoom + ZOOM_STEP));
zoomOutBtn.addEventListener("click", () => setZoom(state.zoom - ZOOM_STEP));

document.addEventListener("keydown", (event) => {
  if (!state.doc) return;
  if (event.key === "ArrowRight" || event.key === "PageDown") {
    goToPage(state.pageNumber + 1);
  } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
    goToPage(state.pageNumber - 1);
  }
});
