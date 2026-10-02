/*
 * Gallery — logic.
 * Settings, photo list and text come from GALLERY_CONFIG (gallery_config.js).
 */
const GCFG = GALLERY_CONFIG;

const PhotoStore = {
  items: [],
  current: 0,

  photoUrl(name) {
    if (/^https?:\/\//i.test(name) || name.includes("/")) return name;
    return GCFG.photoDir + name;
  },

  photoName(name) {
    return name.split("/").pop();
  },

  loadList(names) {
    this.clear();
    (names || []).forEach((name) => {
      const trimmed = String(name || "").trim();
      if (!trimmed) return;
      this.items.push({
        name: this.photoName(trimmed),
        url: this.photoUrl(trimmed)
      });
    });
  },

  isImage(file) {
    const types = GCFG.imageTypes;
    if (types.includes(file.type)) return true;
    return GCFG.imageExtPattern.test(file.name);
  },

  addFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => this.isImage(file));
    files.forEach((file) => {
      this.items.push({
        name: file.name,
        url: URL.createObjectURL(file)
      });
    });
    return files.length;
  },

  clear() {
    this.items.forEach((photo) => {
      if (photo.url && photo.url.indexOf("blob:") === 0) {
        URL.revokeObjectURL(photo.url);
      }
    });
    this.items = [];
    this.current = 0;
  },

  setCurrent(index) {
    if (!this.items.length) {
      this.current = 0;
      return;
    }
    const last = this.items.length - 1;
    this.current = Math.min(Math.max(index, 0), last);
  },

  next() {
    if (this.current < this.items.length - 1) this.current += 1;
  },

  prev() {
    if (this.current > 0) this.current -= 1;
  },

  get currentPhoto() {
    return this.items[this.current] || null;
  }
};

(function () {
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  const fileInput = document.getElementById("file-input");
  const clearBtn = document.getElementById("clear-btn");
  const viewer = document.getElementById("viewer");
  const fullPhoto = document.getElementById("full-photo");
  const photoName = document.getElementById("photo-name");
  const photoCount = document.getElementById("photo-count");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const closeBtn = document.getElementById("close-btn");

  function renderGrid() {
    grid.querySelectorAll("." + GCFG.classes.tile).forEach((tile) => tile.remove());

    if (!PhotoStore.items.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    PhotoStore.items.forEach((photo, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = GCFG.classes.tile;
      button.setAttribute("aria-label", photo.name);

      const img = document.createElement("img");
      img.src = photo.url;
      img.alt = photo.name;

      button.appendChild(img);
      button.addEventListener("click", () => openViewer(index));
      grid.appendChild(button);
    });

    highlightTile(PhotoStore.current);
  }

  function showCurrent() {
    const photo = PhotoStore.currentPhoto;
    if (!photo) return;

    fullPhoto.src = photo.url;
    fullPhoto.alt = photo.name;
    photoName.textContent = photo.name;
    photoCount.textContent = PhotoStore.current + 1 + GCFG.text.countSeparator + PhotoStore.items.length;
    prevBtn.hidden = PhotoStore.current === 0;
    nextBtn.hidden = PhotoStore.current === PhotoStore.items.length - 1;
  }

  function openViewer(index) {
    PhotoStore.setCurrent(index);
    viewer.hidden = false;
    showCurrent();
  }

  function closeViewer() {
    viewer.hidden = true;
    fullPhoto.removeAttribute("src");
    highlightTile(PhotoStore.current);
  }

  function addFromList(fileList) {
    const added = PhotoStore.addFiles(fileList);
    if (added) renderGrid();
  }

  function columnCount() {
    const style = getComputedStyle(grid).gridTemplateColumns;
    return style.split(" ").filter(Boolean).length || GCFG.fallbackColumns;
  }

  function highlightTile(index) {
    const tiles = grid.querySelectorAll("." + GCFG.classes.tile);
    if (!tiles.length) return;
    PhotoStore.setCurrent(index);
    tiles.forEach((tile, i) => {
      tile.classList.toggle(GCFG.classes.selected, i === PhotoStore.current);
    });
    tiles[PhotoStore.current].focus();
  }

  function moveGrid(dx, dy) {
    if (!PhotoStore.items.length) return;
    const cols = columnCount();
    const total = PhotoStore.items.length;
    let index = PhotoStore.current + dx + dy * cols;
    index = Math.min(Math.max(index, 0), total - 1);
    highlightTile(index);
  }

  fileInput.addEventListener("change", () => {
    addFromList(fileInput.files);
    fileInput.value = "";
  });

  clearBtn.addEventListener("click", () => {
    closeViewer();
    PhotoStore.clear();
    renderGrid();
  });

  prevBtn.addEventListener("click", () => {
    PhotoStore.prev();
    showCurrent();
  });

  nextBtn.addEventListener("click", () => {
    PhotoStore.next();
    showCurrent();
  });

  closeBtn.addEventListener("click", closeViewer);

  viewer.addEventListener("click", (event) => {
    if (event.target === viewer || event.target.classList.contains(GCFG.classes.stage)) {
      closeViewer();
    }
  });

  document.addEventListener("keydown", (event) => {
    const K = GCFG.keys;
    if (K.arrows.includes(event.key)) event.preventDefault();

    if (!viewer.hidden) {
      if (event.key === K.close) closeViewer();
      if (K.viewerPrev.includes(event.key)) {
        PhotoStore.prev();
        showCurrent();
      }
      if (K.viewerNext.includes(event.key)) {
        PhotoStore.next();
        showCurrent();
      }
      return;
    }

    if (!PhotoStore.items.length) return;
    if (event.key === K.left) moveGrid(-1, 0);
    if (event.key === K.right) moveGrid(1, 0);
    if (event.key === K.up) moveGrid(0, -1);
    if (event.key === K.down) moveGrid(0, 1);
    if (event.key === K.open) openViewer(PhotoStore.current);
  });

  ["dragenter", "dragover"].forEach((type) => {
    document.addEventListener(type, (event) => {
      event.preventDefault();
      document.body.classList.add(GCFG.classes.dragging);
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    document.addEventListener(type, (event) => {
      event.preventDefault();
      if (type === "drop") addFromList(event.dataTransfer.files);
      document.body.classList.remove(GCFG.classes.dragging);
    });
  });

  PhotoStore.loadList(GCFG.photos || []);
  renderGrid();
})();
