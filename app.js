let wines = [];
let originalWines = [];
let filtered = [];

const $ = (selector) => document.querySelector(selector);
const grid = $("#wineGrid");
const search = $("#search");
const typeFilter = $("#typeFilter");
const countryFilter = $("#countryFilter");
const occasionFilter = $("#occasionFilter");
const jsonEditor = $("#jsonEditor");
const editorStatus = $("#editorStatus");

const state = {
  search: "",
  type: "all",
  country: "all",
  occasion: "all"
};

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const money = (value) => value || "";
const stockKey = (wine) => `rjc-bottles:${wine.name}:${wine.vintage}`;
const openKey = (wine) => `rjc-open:${wine.name}:${wine.vintage}`;
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[char]));

function storedBottleCount(wine) {
  const saved = localStorage.getItem(stockKey(wine));
  return Number(saved ?? wine.bottles ?? 0);
}

function isOpenOrDecanted(wine) {
  const saved = localStorage.getItem(openKey(wine));
  return saved === null ? Boolean(wine.open_decanted) : saved === "true";
}

function updateBottleCount(wine, count) {
  localStorage.setItem(stockKey(wine), String(Math.max(0, count)));
  wine.bottles = Math.max(0, count);
  syncEditor();
  render();
  renderRoute();
}

function updateOpenStatus(wine, open) {
  localStorage.setItem(openKey(wine), String(open));
  wine.open_decanted = open;
  syncEditor();
  render();
  renderRoute();
}

function statusClass(status = "") {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function structureMeter(label, value) {
  const dots = [1, 2, 3, 4, 5].map((item) => `<span class="${item <= value ? "active" : ""}"></span>`).join("");
  return `<div class="meter-row"><p>${label}</p><div class="meter">${dots}</div></div>`;
}

function wineSearchText(wine) {
  return [
    wine.name,
    wine.vintage,
    wine.type,
    wine.country,
    wine.region,
    wine.grapes,
    wine.notes,
    wine.storage,
    wine.serve,
    wine.drink,
    ...(wine.pairings || [])
  ].join(" ").toLowerCase();
}

function applyFilters() {
  state.search = search.value.trim().toLowerCase();
  state.type = typeFilter.value;
  state.country = countryFilter.value;
  state.occasion = occasionFilter.value;

  filtered = wines.filter((wine) => {
    if (state.search && !wineSearchText(wine).includes(state.search)) return false;
    if (state.type !== "all" && wine.type !== state.type) return false;
    if (state.country !== "all" && wine.country !== state.country) return false;
    if (state.occasion === "90" && wine.score < 90) return false;
    if (state.occasion === "ready" && wine.status !== "Ready") return false;
    if (state.occasion === "hold" && wine.status !== "Hold") return false;
    if (state.occasion === "fridge" && !wine.storage.toLowerCase().includes("fridge")) return false;
    if (state.occasion === "cabinet" && !wine.storage.toLowerCase().includes("cabinet")) return false;
    return true;
  });
}

function renderStats() {
  const totalBottles = wines.reduce((sum, wine) => sum + storedBottleCount(wine), 0);
  const avgScore = wines.length ? Math.round(wines.reduce((sum, wine) => sum + Number(wine.score || 0), 0) / wines.length) : 0;
  $("#totalBottles").textContent = totalBottles;
  $("#readyCount").textContent = wines.filter((wine) => wine.status === "Ready").length;
  $("#avgScore").textContent = avgScore;
  $("#resultCount").textContent = `${filtered.length} wine${filtered.length === 1 ? "" : "s"}`;
  $("#resultTitle").textContent = state.search ? `Matched "${state.search}"` : "All bottles";
}

function cardTemplate(wine) {
  const count = storedBottleCount(wine);
  const open = isOpenOrDecanted(wine);
  const tags = (wine.pairings || []).slice(0, 4).map((pairing) => `<span>${escapeHtml(pairing)}</span>`).join("");
  return `
    <article class="wine-card ${wine.type.toLowerCase()} ${open ? "is-open" : ""}">
      <a href="#/wine/${slugify(`${wine.rank}-${wine.name}`)}" aria-label="Open ${escapeHtml(wine.name)}">
        <div class="card-top">
          <span class="rank">#${wine.rank}</span>
          <span class="price">${money(wine.price_band)}</span>
        </div>
        ${open ? "<span class=\"open-badge\">Open / decanted</span>" : ""}
        <h3>${escapeHtml(wine.name)}</h3>
        <p class="wine-meta">${escapeHtml(wine.vintage)} / ${escapeHtml(wine.region)} / ${escapeHtml(wine.country)}</p>
        <p class="notes">${escapeHtml(wine.notes)}</p>
        <div class="card-facts">
          <span>${escapeHtml(wine.grapes)}</span>
          <span>${escapeHtml(wine.serve)}</span>
        </div>
        <div class="card-bottom">
          <span class="status ${statusClass(wine.status)}">${escapeHtml(wine.status)}</span>
          <span class="score">${wine.score}<small>/100</small></span>
          <span class="stock">${count} bottle${count === 1 ? "" : "s"}</span>
        </div>
        <div class="tags">${tags}</div>
      </a>
    </article>
  `;
}

function render() {
  applyFilters();
  renderStats();
  grid.innerHTML = filtered.length ? filtered.map(cardTemplate).join("") : $("#emptyTemplate").innerHTML;
}

function renderDetail(slug) {
  const wine = wines.find((item) => slugify(`${item.rank}-${item.name}`) === slug);
  if (!wine) {
    location.hash = "#/";
    return;
  }

  const count = storedBottleCount(wine);
  const open = isOpenOrDecanted(wine);
  $("#detailView").innerHTML = `
    <a class="back-link" href="#/">Back to cellar</a>
    <section class="detail-hero">
      <div>
        <p class="eyebrow">${escapeHtml(wine.type)} / ${escapeHtml(wine.country)}</p>
        <h1>${escapeHtml(wine.name)}</h1>
        <p class="subtitle">${escapeHtml(wine.vintage)} / ${escapeHtml(wine.region)} / ${escapeHtml(wine.grapes)}</p>
      </div>
      <div class="score-panel">
        <span>${wine.score}</span>
        <small>/100 cellar score</small>
      </div>
    </section>
    <section class="detail-grid">
      <article class="service-status ${open ? "is-open" : ""}">
        <h2>Service status</h2>
        <strong>${open ? "Open / decanted now" : "Unopened"}</strong>
        <p>${open ? "This bottle is already open in front of guests. Offer this first before opening another." : "Mark it open once the bottle is pulled, opened, or decanted for service."}</p>
        <div class="service-actions">
          <button data-open-status="true" ${open ? "disabled" : ""}>Mark open / decanted</button>
          <button data-open-status="false" ${open ? "" : "disabled"}>Clear</button>
        </div>
      </article>
      <article class="large-panel">
        <h2>Tasting note</h2>
        <p>${escapeHtml(wine.notes)}</p>
        <div class="tags">${(wine.pairings || []).map((pairing) => `<span>${escapeHtml(pairing)}</span>`).join("")}</div>
      </article>
      <article>
        <h2>Bottle count</h2>
        <div class="bottle-control">
          <button data-count="-1" aria-label="Remove one bottle">-</button>
          <strong>${count}</strong>
          <button data-count="1" aria-label="Add one bottle">+</button>
        </div>
        <p>Saved locally on this iPad. Export JSON from the editor to publish this count.</p>
      </article>
      <article>
        <h2>Serving</h2>
        <p>${escapeHtml(wine.serve)}</p>
        <p><strong>Drink:</strong> ${escapeHtml(wine.drink)}</p>
      </article>
      <article>
        <h2>Storage</h2>
        <p>${escapeHtml(wine.storage)}</p>
        <span class="status ${statusClass(wine.status)}">${escapeHtml(wine.status)}</span>
      </article>
      <article>
        <h2>Structure</h2>
        ${structureMeter("Body", wine.body)}
        ${structureMeter("Oak", wine.oak)}
        ${structureMeter("Sweetness", wine.sweetness)}
      </article>
      <article>
        <h2>Guest note</h2>
        <textarea id="guestNote" placeholder="Private tasting note for this bottle...">${localStorage.getItem(`rjc-note:${wine.name}`) || ""}</textarea>
      </article>
    </section>
  `;

  $("#detailView").querySelectorAll("[data-count]").forEach((button) => {
    button.addEventListener("click", () => updateBottleCount(wine, count + Number(button.dataset.count)));
  });
  $("#detailView").querySelectorAll("[data-open-status]").forEach((button) => {
    button.addEventListener("click", () => updateOpenStatus(wine, button.dataset.openStatus === "true"));
  });
  $("#guestNote").addEventListener("input", (event) => localStorage.setItem(`rjc-note:${wine.name}`, event.target.value));
}

function showView(name) {
  ["cellarView", "detailView", "guideView", "adminView"].forEach((id) => $(`#${id}`).classList.add("hidden"));
  $(`#${name}`).classList.remove("hidden");
  document.querySelectorAll("[data-nav]").forEach((link) => link.classList.toggle("active", link.dataset.nav === name.replace("View", "")));
}

function renderRoute() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/wine/")) {
    showView("detailView");
    renderDetail(hash.replace("#/wine/", ""));
  } else if (hash === "#/guide") {
    showView("guideView");
  } else if (hash === "#/admin") {
    showView("adminView");
    syncEditor();
  } else {
    showView("cellarView");
  }
}

function fillFilters() {
  [...new Set(wines.map((wine) => wine.type))].sort().forEach((type) => {
    typeFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`);
  });
  [...new Set(wines.map((wine) => wine.country))].sort().forEach((country) => {
    countryFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`);
  });
}

function syncEditor() {
  wines.forEach((wine) => {
    wine.bottles = storedBottleCount(wine);
    wine.open_decanted = isOpenOrDecanted(wine);
  });
  jsonEditor.value = JSON.stringify(wines, null, 2);
}

function applyEditorJson() {
  try {
    const parsed = JSON.parse(jsonEditor.value);
    if (!Array.isArray(parsed)) throw new Error("The top-level JSON must be an array.");
    wines = parsed;
    editorStatus.textContent = "Valid JSON. Preview updated.";
    render();
  } catch (error) {
    editorStatus.textContent = `JSON issue: ${error.message}`;
  }
}

function downloadJson() {
  applyEditorJson();
  const blob = new Blob([JSON.stringify(wines, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "wines.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function bindEvents() {
  [search, typeFilter, countryFilter, occasionFilter].forEach((control) => control.addEventListener("input", render));
  document.querySelectorAll(".quick-picks button").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = button.dataset.preset;
      search.value = "";
      typeFilter.value = "all";
      countryFilter.value = "all";
      occasionFilter.value = "all";
      if (preset === "top") occasionFilter.value = "90";
      if (!["top", "reset"].includes(preset)) search.value = preset;
      render();
    });
  });

  $("#downloadJson").addEventListener("click", downloadJson);
  $("#resetJson").addEventListener("click", () => {
    wines = structuredClone(originalWines);
    syncEditor();
    render();
    editorStatus.textContent = "Reloaded original data.";
  });
  jsonEditor.addEventListener("input", applyEditorJson);
  $("#jsonImport").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    jsonEditor.value = await file.text();
    applyEditorJson();
  });
  window.addEventListener("hashchange", renderRoute);
}

fetch("wines.json")
  .then((response) => response.json())
  .then((data) => {
    wines = data;
    originalWines = structuredClone(data);
    fillFilters();
    bindEvents();
    syncEditor();
    render();
    renderRoute();
  })
  .catch(() => {
    grid.innerHTML = "<article class=\"empty-state\"><h3>Wine data could not be loaded</h3><p>Check that wines.json is deployed beside index.html.</p></article>";
  });
