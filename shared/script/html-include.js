
function includeHTML(file, selector) {
  const el = document.querySelector(selector);
  if (!el) return console.error("Target not found:", selector);

  fetch(file)
    .then(res => {
      if (!res.ok) throw new Error(`Could not load ${file}`);
      return res.text();
    })
    .then(html => {
      el.innerHTML = html;
    })
    .catch(err => {
      // R57: the message carries the file name: show it as text, never as HTML
      const box = document.createElement("div");
      box.style.color = "red";
      box.textContent = err && err.message ? err.message : String(err);
      el.replaceChildren(box);
    });
}

