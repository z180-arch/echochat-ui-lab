// ============================================================
//  EchoChat Rebuild · UI Components
// ============================================================

export function toast(text, type = "info") {
  let box = document.querySelector(".toast-container");
  if (!box) {
    box = document.createElement("div");
    box.className = "toast-container";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
