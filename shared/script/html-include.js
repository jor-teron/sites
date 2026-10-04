
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
      el.innerHTML = `<div style="color:red;">${err.message}</div>`;
    });
}

