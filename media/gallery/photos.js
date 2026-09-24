const PhotoStore = {
  items: [],
  current: 0,

  photoUrl(name) {
    if (/^https?:\/\//i.test(name) || name.includes("/")) return name;
    return "photos/" + name;
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
    const types = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (types.includes(file.type)) return true;
    return /\.(jpe?g|png|webp|gif)$/i.test(file.name);
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
    grid.querySelectorAll(".tile").forEach((tile) => tile.remove());

    if (!PhotoStore.items.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    PhotoStore.items.forEach((photo, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tile";
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
    photoCount.textContent = PhotoStore.current + 1 + " / " + PhotoStore.items.length;
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
    return style.split(" ").filter(Boolean).length || 3;
  }

  function highlightTile(index) {
    const tiles = grid.querySelectorAll(".tile");
    if (!tiles.length) return;
    PhotoStore.setCurrent(index);
    tiles.forEach((tile, i) => {
      tile.classList.toggle("selected", i === PhotoStore.current);
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
    if (event.target === viewer || event.target.classList.contains("stage")) {
      closeViewer();
    }
  });

  document.addEventListener("keydown", (event) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (keys.includes(event.key)) event.preventDefault();

    if (!viewer.hidden) {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        PhotoStore.prev();
        showCurrent();
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        PhotoStore.next();
        showCurrent();
      }
      return;
    }

    if (!PhotoStore.items.length) return;
    if (event.key === "ArrowLeft") moveGrid(-1, 0);
    if (event.key === "ArrowRight") moveGrid(1, 0);
    if (event.key === "ArrowUp") moveGrid(0, -1);
    if (event.key === "ArrowDown") moveGrid(0, 1);
    if (event.key === "Enter") openViewer(PhotoStore.current);
  });

  ["dragenter", "dragover"].forEach((type) => {
    document.addEventListener(type, (event) => {
      event.preventDefault();
      document.body.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    document.addEventListener(type, (event) => {
      event.preventDefault();
      if (type === "drop") addFromList(event.dataTransfer.files);
      document.body.classList.remove("dragging");
    });
  });

  PhotoStore.loadList(typeof photoFiles !== "undefined" ? photoFiles : []);
  renderGrid();
})();
