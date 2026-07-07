let wines = [];
let originalWines = [];
let filtered = [];
let sharedState = new Map();
let sharedStateLoaded = false;
let catalogDirty = false;
let previewWineIds = new Set();
let activeCategory = "wine";
let cameraPhotoFiles = [];
let libraryPhotoFiles = [];

const $ = (selector) => document.querySelector(selector);
const grid = $("#wineGrid");
const search = $("#search");
const typeFilter = $("#typeFilter");
const countryFilter = $("#countryFilter");
const occasionFilter = $("#occasionFilter");
const jsonEditor = $("#jsonEditor");
const editorStatus = $("#editorStatus");
const aiStatus = $("#aiStatus");
const photoStatus = $("#photoStatus");
const catalogTarget = $("#catalogTarget");
const draftKegField = $("#draftKegField");
const newWineIsKeg = $("#newWineIsKeg");

const state = {
  search: "",
  type: "all",
  country: "all",
  occasion: "all"
};

const SUPABASE_URL = "https://hjegymnxhxloddqwbdai.supabase.co";
const SUPABASE_KEY = "sb_publishable_eCKAwIv3Mq_b-vwjOoa9MA_ECjv1N0D";
const SUPABASE_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json"
};
const AI_ENRICH_URL = `${SUPABASE_URL}/functions/v1/enrich-wine`;
const EDITOR_UNLOCK_KEY = "rjc-editor-unlocked-v2";
const WINE_HERO_BACKGROUND = [
  "linear-gradient(110deg, rgba(13, 11, 10, 0.92), rgba(13, 11, 10, 0.48))",
  "url('assets/dirty-duck-hero.png') center / cover"
].join(", ");
const BEER_HERO_BACKGROUND = [
  "linear-gradient(110deg, rgba(13, 11, 10, 0.88), rgba(13, 11, 10, 0.34))",
  "url('assets/beer-fridge-hero.png') center / cover"
].join(", ");
const SPIRITS_HERO_BACKGROUND = [
  "linear-gradient(110deg, rgba(13, 11, 10, 0.9), rgba(13, 11, 10, 0.38))",
  "url('https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&w=1800&q=80') center / cover"
].join(", ");

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const money = (value) => value || "";
const itemCategory = (wine) => wine.category || "wine";
const activeItems = () => wines.filter((wine) => itemCategory(wine) === activeCategory);
const activeCopy = () => {
  if (activeCategory === "beer") return {
      title: "The Dirty Duck Beer Fridge",
      totalLabel: "cans / bottles in stock",
      resultUnit: "beer",
      allTitle: "All beers",
      searchPlaceholder: "Beer, brewery, style, country, pairing...",
      back: "Back to beer fridge",
      scoreLabel: "/100 fridge score",
      openNow: "On tap now",
      openHelp: "Mark this keg on tap when it is loaded into the PerfectDraft machine.",
      openActive: "This keg is currently pouring from the PerfectDraft machine.",
      storageSaved: "Saved to the shared fridge after admin PIN approval.",
      photoStatus: "Enter a beer name, take a photo, or both."
    };
  if (activeCategory === "spirits") return {
    title: "The Dirty Duck Top Shelf",
    totalLabel: "bottles on shelf",
    resultUnit: "spirit",
    allTitle: "All spirits",
    searchPlaceholder: "Whiskey, vodka, gin, tequila, country...",
    back: "Back to Top Shelf",
    scoreLabel: "/100 shelf score",
    openNow: "Open now",
    openHelp: "Mark it open once the bottle is opened for service.",
    openActive: "This bottle is already open on the top shelf.",
    storageSaved: "Saved to the shared top shelf after admin PIN approval.",
    photoStatus: "Enter a spirit name, take a photo, or both."
  };
  return {
    title: "The Dirty Duck Wine List",
    totalLabel: "bottles in stock",
    resultUnit: "wine",
    allTitle: "All bottles",
    searchPlaceholder: "Wine, grape, country, pairing...",
    back: "Back to cellar",
    scoreLabel: "/100 cellar score",
    openNow: "Open / decanted now",
    openHelp: "Mark it open once the bottle is pulled, opened, or decanted for service.",
    openActive: "This bottle is already open in front of guests. Offer this first before opening another.",
    storageSaved: "Saved to the shared cellar after admin PIN approval.",
    photoStatus: "Enter a name, take a photo, or both."
  };
};
const categoryPrefix = (wine) => itemCategory(wine) === "wine" ? "" : `${itemCategory(wine)}-`;
const wineId = (wine) => slugify(`${categoryPrefix(wine)}${wine.rank}-${wine.name}`);
const stockKey = (wine) => `rjc-bottles:${itemCategory(wine)}:${wine.name}:${wine.vintage}`;
const openKey = (wine) => `rjc-open:${itemCategory(wine)}:${wine.name}:${wine.vintage}`;
const noteKey = (wine) => `rjc-note:${itemCategory(wine)}:${wine.name}:${wine.vintage}`;
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[char]));

function storedBottleCount(wine) {
  const shared = sharedState.get(wineId(wine));
  if (shared && shared.bottles !== null && shared.bottles !== undefined) return Number(shared.bottles);
  if (sharedStateLoaded) return Number(wine.bottles ?? 0);
  const saved = localStorage.getItem(stockKey(wine));
  return Number(saved ?? wine.bottles ?? 0);
}

function cleanCatalogWine(wine) {
  const copy = { ...wine };
  delete copy.open_decanted;
  delete copy.guest_note;
  return copy;
}

function normalizeWine(wine) {
  return {
    ...wine,
    category: wine.category || "wine",
    package_type: wine.package_type || "",
    pairings: Array.isArray(wine.pairings) ? wine.pairings : [],
    rank: Number(wine.rank || 0),
    score: Number(wine.score || 0),
    bottles: Number(wine.bottles || 0),
    body: Number(wine.body || 0),
    oak: Number(wine.oak || 0),
    sweetness: Number(wine.sweetness || 0)
  };
}

function blankWine(name = "") {
  const category = catalogTarget?.value || activeCategory;
  const isKeg = category === "beer" && Boolean(newWineIsKeg?.checked);
  const sameCategory = wines.filter((wine) => itemCategory(wine) === category);
  const nextRank = sameCategory.length ? Math.max(...sameCategory.map((wine) => Number(wine.rank || 0))) + 1 : 1;
  const isBeer = category === "beer";
  const isSpirit = category === "spirits";
  return normalizeWine({
    category,
    package_type: isKeg ? "keg" : "",
    rank: nextRank,
    name: name || (isBeer ? "New Beer" : isSpirit ? "New Spirit" : "New Wine"),
    vintage: "NV",
    type: isBeer ? "Beer" : isSpirit ? "Whiskey" : "Red",
    country: "Unknown",
    region: "Unknown",
    grapes: isBeer ? "Malt / hops" : isSpirit ? "Spirit style / botanicals" : "Unknown",
    score: isBeer ? 80 : isSpirit ? 88 : 85,
    storage: isKeg ? "PerfectDraft keg reserve" : isBeer ? "Beer fridge" : isSpirit ? "Top shelf" : "Cellar",
    drink: "Now",
    status: "Ready",
    price_band: "£",
    body: isBeer ? 2 : isSpirit ? 4 : 3,
    oak: 1,
    sweetness: 1,
    serve: isKeg ? "Serve chilled from the PerfectDraft machine" : isBeer ? "Serve chilled" : isSpirit ? "Serve neat, over ice, or in the right cocktail" : "Serve at the right temperature for the style",
    notes: isBeer ? "Add beer notes." : isSpirit ? "Add spirit notes." : "Add tasting notes.",
    pairings: isBeer ? ["Snacks"] : isSpirit ? ["Neat pour", "Cocktails"] : ["Food pairing"],
    bottles: 1
  });
}

function addWineToCatalog(wine) {
  const normalized = normalizeWine(wine);
  const existingIndex = wines.findIndex((item) => wineId(item) === wineId(normalized));
  if (existingIndex >= 0) {
    wines[existingIndex] = normalized;
  } else {
    wines.push(normalized);
  }
  previewWineIds.add(wineId(normalized));
  wines.sort((a, b) => Number(a.rank || 0) - Number(b.rank || 0));
  setCatalogDirty(true);
  fillFilters();
  syncEditor();
  render();
  renderEditorPreview();
  editorStatus.textContent = `${catalogCountSummary(wines)} ready to save. Use Save catalogue to Supabase to publish it.`;
  aiStatus.textContent = "Added to unsaved preview.";
}

function setCatalogDirty(dirty) {
  catalogDirty = dirty;
  $("#editorPreviewNotice")?.classList.toggle("hidden", !dirty);
  renderEditorPreview();
}

function renderEditorPreview() {
  const panel = $("#editorPreviewPanel");
  const previewGrid = $("#editorPreviewGrid");
  const previewEmpty = $("#editorPreviewEmpty");
  if (!panel || !previewGrid) return;

  const previewWines = wines.filter((wine) => previewWineIds.has(wineId(wine)));
  const showPreview = previewWines.length > 0;
  panel.classList.remove("hidden");
  previewGrid.classList.toggle("hidden", !showPreview);
  previewEmpty?.classList.toggle("hidden", showPreview);

  $("#editorPreviewTitle").textContent = showPreview
    ? `${previewWines.length} unsaved bottle${previewWines.length === 1 ? "" : "s"}`
    : "Catalogue preview";
  previewGrid.innerHTML = showPreview ? previewWines.map(cardTemplate).join("") : "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function imageElementFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function fileToDataUrl(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await imageElementFromUrl(objectUrl);
    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch (error) {
    console.warn(error);
    return readFileAsDataUrl(file);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function enrichWineDraft() {
  const name = $("#newWineName").value.trim();
  const files = selectedPhotoFiles();
  const category = catalogTarget?.value || activeCategory;
  const isKeg = category === "beer" && Boolean(newWineIsKeg?.checked);
  const button = $("#enrichWine");
  if (!name && !files.length) {
    aiStatus.textContent = "Add a drink name, one photo, or several photos first.";
    return;
  }

  button.disabled = true;
  aiStatus.textContent = files.length > 1
    ? `Asking AI to catalogue ${files.length} bottles...`
    : "Asking AI to read and catalogue the bottle...";
  try {
    const images = await Promise.all(files.map(fileToDataUrl));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), files.length > 1 ? Math.min(90000, files.length * 18000) : 12000);
    const response = await fetch(AI_ENRICH_URL, {
      method: "POST",
      headers: SUPABASE_HEADERS,
      signal: controller.signal,
      body: JSON.stringify({
        name,
        image: images[0] || null,
        images,
        category,
        rank: wines.filter((wine) => itemCategory(wine) === category).length
          ? Math.max(...wines.filter((wine) => itemCategory(wine) === category).map((wine) => Number(wine.rank || 0))) + 1
          : 1
      })
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    const entries = Array.isArray(result.entries) ? result.entries : [result];
    const failedCount = Number(result.failed || 0);
    const baseRank = wines.filter((wine) => itemCategory(wine) === category).length
      ? Math.max(...wines.filter((wine) => itemCategory(wine) === category).map((wine) => Number(wine.rank || 0))) + 1
      : 1;
    entries.forEach((entry, index) => {
      addWineToCatalog(normalizeWine({
        ...entry,
        category,
        package_type: isKeg ? "keg" : entry.package_type || "",
        storage: isKeg ? "PerfectDraft keg reserve" : entry.storage,
        serve: isKeg ? "Serve chilled from the PerfectDraft machine" : entry.serve,
        bottles: isKeg ? 1 : entry.bottles,
        rank: entry.rank || baseRank + index
      }));
    });
    cameraPhotoFiles = [];
    libraryPhotoFiles = [];
    $("#newWinePhoto").value = "";
    $("#newWineLibrary").value = "";
    updatePhotoStatus();
    aiStatus.textContent = failedCount
      ? `Added ${entries.length} AI-filled draft${entries.length === 1 ? "" : "s"} to review. ${failedCount} photo${failedCount === 1 ? "" : "s"} could not be read.`
      : `Added ${entries.length} AI-filled draft${entries.length === 1 ? "" : "s"} to review.`;
  } catch (error) {
    console.warn(error);
    const fallback = blankWine(name);
    addWineToCatalog(fallback);
    const details = String(error?.message || error);
    aiStatus.textContent = details.includes("image")
      ? "AI could not read one of those photos, so I added a draft from the name. Try Photo Library images rather than live camera shots."
      : "AI function could not complete, so I added a draft from the name.";
  } finally {
    button.disabled = false;
  }
}

function addManualWineDraft() {
  const name = $("#newWineName").value.trim();
  addWineToCatalog(blankWine(name));
}

function updateEditorCopy() {
  if (!catalogTarget || !aiStatus) return;
  const category = catalogTarget.value;
  draftKegField?.classList.toggle("hidden", category !== "beer");
  if (category !== "beer" && newWineIsKeg) newWineIsKeg.checked = false;
  aiStatus.textContent = category === "beer"
    ? "Enter a beer name, take a photo, or both."
    : category === "spirits"
      ? "Enter a spirit name, take a photo, or both."
      : "Enter a name, take a photo, or both.";
}

function selectedPhotoFiles() {
  return [...cameraPhotoFiles, ...libraryPhotoFiles];
}

function updatePhotoStatus() {
  const count = selectedPhotoFiles().length;
  if (!count) {
    if (photoStatus) photoStatus.textContent = "No photos selected.";
    updateEditorCopy();
    return;
  }
  if (photoStatus) photoStatus.textContent = `${count} photo${count === 1 ? "" : "s"} selected.`;
  aiStatus.textContent = `${count} photo${count === 1 ? "" : "s"} selected. Use AI fill details to catalogue ${count === 1 ? "it" : "them"}.`;
}

function captureSelectedPhotos(event, source) {
  const files = [...event.target.files];
  if (source === "camera") {
    cameraPhotoFiles = files;
  } else {
    libraryPhotoFiles = files;
  }
  updatePhotoStatus();
}

function catalogCounts(items) {
  return items.reduce((totals, wine) => {
    const category = itemCategory(wine);
    totals[category] = (totals[category] || 0) + 1;
    return totals;
  }, {});
}

function catalogCountSummary(items) {
  const counts = catalogCounts(items);
  return `${counts.wine || 0} wine, ${counts.beer || 0} beer, ${counts.spirits || 0} top shelf`;
}

async function loadRemoteCatalogCounts() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/wine_catalog?select=data`, {
    headers: SUPABASE_HEADERS
  });
  if (!response.ok) throw new Error(await response.text());
  const rows = await response.json();
  return catalogCounts(rows.map((row) => normalizeWine(row.data)));
}

async function loadWineCatalogFromSupabase() {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/wine_catalog?select=wine_id,rank,data&order=rank.asc`, {
      headers: SUPABASE_HEADERS
    });
    if (!response.ok) throw new Error("Could not load Supabase wine catalogue.");
    const rows = await response.json();
    if (!rows.length) return null;
    return rows.map((row) => normalizeWine(row.data));
  } catch (error) {
    console.warn(error);
    return null;
  }
}

async function loadWineCatalog() {
  const remoteCatalog = await loadWineCatalogFromSupabase();
  if (remoteCatalog) return remoteCatalog;

  const response = await fetch("wines.json");
  if (!response.ok) throw new Error("Wine data could not be loaded.");
  const localCatalog = await response.json();
  return localCatalog.map(normalizeWine);
}

function isOpenOrDecanted(wine) {
  const shared = sharedState.get(wineId(wine));
  if (shared && shared.open_decanted !== null && shared.open_decanted !== undefined) return Boolean(shared.open_decanted);
  if (sharedStateLoaded) return Boolean(wine.open_decanted);
  const saved = localStorage.getItem(openKey(wine));
  return saved === null ? Boolean(wine.open_decanted) : saved === "true";
}

function guestNote(wine) {
  const shared = sharedState.get(wineId(wine));
  if (shared && shared.guest_note) return shared.guest_note;
  if (sharedStateLoaded) return wine.guest_note || "";
  return localStorage.getItem(noteKey(wine)) || localStorage.getItem(`rjc-note:${wine.name}`) || "";
}

async function unlockEditor() {
  if (sessionStorage.getItem(EDITOR_UNLOCK_KEY) === "true") return true;

  const pin = window.prompt("Enter admin PIN to open the Editor:");
  if (!pin) return false;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_admin_pin_with_pin`, {
      method: "POST",
      headers: SUPABASE_HEADERS,
      body: JSON.stringify({ p_pin: pin })
    });

    if (!response.ok) throw new Error(await response.text());
    sessionStorage.setItem("rjc-admin-pin", pin);
    sessionStorage.setItem(EDITOR_UNLOCK_KEY, "true");
    return true;
  } catch (error) {
    console.warn(error);
    const message = String(error?.message || error);
    window.alert(message.includes("Invalid admin PIN")
      ? "Invalid admin PIN."
      : "Editor PIN check is not set up yet. Add the verify_admin_pin_with_pin SQL function in Supabase.");
    return false;
  }
}

async function loadSharedState() {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/wine_state?select=*`, {
      headers: SUPABASE_HEADERS
    });
    if (!response.ok) throw new Error("Could not load shared cellar state.");
    const rows = await response.json();
    sharedState = new Map(rows.map((row) => [row.wine_id, row]));
    sharedStateLoaded = true;
  } catch (error) {
    console.warn(error);
    sharedStateLoaded = false;
  }
}

function adminPin() {
  const saved = sessionStorage.getItem("rjc-admin-pin");
  if (saved) return saved;
  const pin = window.prompt("Enter admin PIN to update the shared wine list:");
  if (!pin) return "";
  sessionStorage.setItem("rjc-admin-pin", pin);
  return pin;
}

async function saveSharedWineState(wine, overrides = {}) {
  const id = wineId(wine);
  const next = {
    wine_id: id,
    bottles: overrides.bottles ?? storedBottleCount(wine),
    open_decanted: overrides.open_decanted ?? isOpenOrDecanted(wine),
    guest_note: overrides.guest_note ?? guestNote(wine)
  };
  const pin = adminPin();
  if (!pin) return false;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_wine_state_with_pin`, {
    method: "POST",
    headers: SUPABASE_HEADERS,
    body: JSON.stringify({
      p_pin: pin,
      p_wine_id: next.wine_id,
      p_bottles: next.bottles,
      p_open_decanted: next.open_decanted,
      p_guest_note: next.guest_note
    })
  });

  if (!response.ok) {
    const details = await response.text();
    sessionStorage.removeItem("rjc-admin-pin");
    window.alert(details.includes("Invalid admin PIN") ? "Invalid admin PIN." : "Could not save to Supabase. Check the table/function setup.");
    return false;
  }

  sharedState.set(id, next);
  return true;
}

async function saveCatalogToSupabase() {
  const pin = adminPin();
  if (!pin) return;

  const catalog = wines.map((wine) => cleanCatalogWine(normalizeWine(wine)));
  jsonEditor.value = JSON.stringify(catalog, null, 2);
  const counts = catalogCounts(catalog);
  editorStatus.textContent = `Saving to Supabase: ${catalogCountSummary(catalog)}...`;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/replace_wine_catalog_with_pin`, {
    method: "POST",
    headers: SUPABASE_HEADERS,
    body: JSON.stringify({
      p_pin: pin,
      p_wines: catalog
    })
  });

  if (!response.ok) {
    const details = await response.text();
    sessionStorage.removeItem("rjc-admin-pin");
    editorStatus.textContent = details.includes("Invalid admin PIN") ? "Invalid admin PIN." : `Could not save catalogue to Supabase. ${details}`;
    return;
  }

  originalWines = structuredClone(catalog);
  wines = catalog.map(normalizeWine);
  previewWineIds = new Set();
  setCatalogDirty(false);
  fillFilters();
  syncEditor();
  render();
  renderRoute();
  try {
    const remoteCounts = await loadRemoteCatalogCounts();
    editorStatus.textContent = `Supabase now has: ${remoteCounts.wine || 0} wine, ${remoteCounts.beer || 0} beer, ${remoteCounts.spirits || 0} top shelf.`;
  } catch (error) {
    console.warn(error);
    editorStatus.textContent = `Catalogue save finished, but verification failed. Sent: ${counts.wine || 0} wine, ${counts.beer || 0} beer, ${counts.spirits || 0} top shelf.`;
  }
}

async function updateBottleCount(wine, count) {
  const nextCount = Math.max(0, count);
  const saved = await saveSharedWineState(wine, { bottles: nextCount });
  if (!saved) return;
  localStorage.setItem(stockKey(wine), String(Math.max(0, count)));
  wine.bottles = nextCount;
  syncEditor();
  render();
  renderRoute();
}

async function updateOpenStatus(wine, open) {
  const saved = await saveSharedWineState(wine, { open_decanted: open });
  if (!saved) return;
  localStorage.setItem(openKey(wine), String(open));
  wine.open_decanted = open;
  syncEditor();
  render();
  renderRoute();
}

async function updateGuestNote(wine, note) {
  const saved = await saveSharedWineState(wine, { guest_note: note });
  if (!saved) return;
  localStorage.setItem(noteKey(wine), note);
  syncEditor();
  renderRoute();
}

function statusClass(status = "") {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function isDraftBeer(wine) {
  if (itemCategory(wine) !== "beer") return false;
  if (wine.package_type === "keg") return true;
  const text = [
    wine.name,
    wine.type,
    wine.storage,
    wine.serve,
    wine.notes,
    wine.grapes
  ].join(" ").toLowerCase();
  return isOpenOrDecanted(wine) || /perfect\s*draft|perfectdraft|draft|draught|tap|keg/.test(text);
}

function draftStatusLabel(wine) {
  if (isOpenOrDecanted(wine)) return "On tap now";
  if (storedBottleCount(wine) > 0) return "Reserve keg";
  return "Out of stock";
}

function stockUnit(wine) {
  if (itemCategory(wine) === "beer") return isDraftBeer(wine) ? "keg" : "can";
  return "bottle";
}

function draftCardTemplate(wine) {
  const count = storedBottleCount(wine);
  const onTap = isOpenOrDecanted(wine);
  return `
    <article class="draft-card ${onTap ? "is-live" : ""}">
      <a href="#/item/${wineId(wine)}" aria-label="Open ${escapeHtml(wine.name)}">
        <span class="draft-state">${draftStatusLabel(wine)}</span>
        <h3>${escapeHtml(wine.name)}</h3>
        <p>${escapeHtml(wine.type)}${wine.country ? ` / ${escapeHtml(wine.country)}` : ""}</p>
        <div class="draft-facts">
          <span>${count} keg${count === 1 ? "" : "s"}</span>
          <span>${escapeHtml(wine.serve || "Serve chilled")}</span>
        </div>
      </a>
    </article>
  `;
}

function renderDraftSection() {
  const section = $("#draftSection");
  const grid = $("#draftGrid");
  const countLabel = $("#draftCount");
  if (!section || !grid || !countLabel) return;

  section.classList.toggle("hidden", activeCategory !== "beer");
  if (activeCategory !== "beer") return;

  const draftBeers = activeItems().filter(isDraftBeer);
  const onTap = draftBeers.filter(isOpenOrDecanted);
  const reserve = draftBeers.filter((wine) => !isOpenOrDecanted(wine));
  countLabel.textContent = onTap.length
    ? `${onTap[0].name} pouring now`
    : reserve.length
      ? `${reserve.length} reserve keg${reserve.length === 1 ? "" : "s"}`
      : "No keg selected";

  grid.innerHTML = draftBeers.length
    ? [...onTap, ...reserve].map(draftCardTemplate).join("")
    : `
      <article class="draft-empty">
        <h3>No beer on draft yet</h3>
        <p>Add a beer in the Editor and tick PerfectDraft keg to show it here.</p>
      </article>
    `;
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
    if (itemCategory(wine) !== activeCategory) return false;
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
  const items = activeItems();
  const copy = activeCopy();
  const totalBottles = items.reduce((sum, wine) => sum + storedBottleCount(wine), 0);
  const avgScore = items.length ? Math.round(items.reduce((sum, wine) => sum + Number(wine.score || 0), 0) / items.length) : 0;
  const brandMark = $(".brand-mark");
  brandMark?.classList.toggle("brand-mark-wine", activeCategory === "wine");
  brandMark?.classList.toggle("brand-mark-beer", activeCategory === "beer");
  brandMark?.classList.toggle("brand-mark-spirits", activeCategory === "spirits");
  $("#mainTitle").textContent = copy.title;
  $("#totalLabel").textContent = copy.totalLabel;
  search.placeholder = copy.searchPlaceholder;
  const mainHero = $("#mainHero");
  mainHero.classList.toggle("beer-hero", activeCategory === "beer");
  mainHero.classList.toggle("spirits-hero", activeCategory === "spirits");
  mainHero.style.background = activeCategory === "beer"
    ? BEER_HERO_BACKGROUND
    : activeCategory === "spirits"
      ? SPIRITS_HERO_BACKGROUND
      : WINE_HERO_BACKGROUND;
  $("#heroPanel").classList.toggle("beer-stats", activeCategory === "beer" || activeCategory === "spirits");
  $("#readyStat").classList.toggle("hidden", activeCategory === "beer" || activeCategory === "spirits");
  $("#totalBottles").textContent = totalBottles;
  $("#readyCount").textContent = items.filter((wine) => wine.status === "Ready").length;
  $("#avgScore").textContent = avgScore;
  $("#resultCount").textContent = `${filtered.length} ${copy.resultUnit}${filtered.length === 1 ? "" : "s"}`;
  $("#resultTitle").textContent = state.search ? `Matched "${state.search}"` : copy.allTitle;
}

function cardTemplate(wine) {
  const count = storedBottleCount(wine);
  const open = isOpenOrDecanted(wine);
  const showOpenBadge = open && (itemCategory(wine) !== "beer" || isDraftBeer(wine));
  const unit = stockUnit(wine);
  const tags = (wine.pairings || []).slice(0, 4).map((pairing) => `<span>${escapeHtml(pairing)}</span>`).join("");
  return `
    <article class="wine-card ${wine.type.toLowerCase()} ${showOpenBadge ? "is-open" : ""}">
      <a href="#/item/${wineId(wine)}" aria-label="Open ${escapeHtml(wine.name)}">
        <div class="card-top">
          <span class="rank">#${wine.rank}</span>
          <span class="price">${money(wine.price_band)}</span>
        </div>
        ${showOpenBadge ? `<span class="open-badge">${itemCategory(wine) === "beer" ? "On tap now" : "Open / decanted"}</span>` : ""}
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
          <span class="stock">${count} ${unit}${count === 1 ? "" : "s"}</span>
        </div>
        <div class="tags">${tags}</div>
      </a>
    </article>
  `;
}

function render() {
  applyFilters();
  renderStats();
  renderDraftSection();
  grid.innerHTML = filtered.length ? filtered.map(cardTemplate).join("") : $("#emptyTemplate").innerHTML;
}

function renderDetail(slug) {
  const wine = wines.find((item) => wineId(item) === slug);
  if (!wine) {
    location.hash = "#/";
    return;
  }

  activeCategory = itemCategory(wine);
  const copy = activeCopy();
  const backHref = activeCategory === "beer" ? "#/beer" : activeCategory === "spirits" ? "#/top-shelf" : "#/";
  const count = storedBottleCount(wine);
  const open = isOpenOrDecanted(wine);
  const showServiceStatus = itemCategory(wine) !== "beer" || isDraftBeer(wine);
  const unit = stockUnit(wine);
  const serviceTitle = itemCategory(wine) === "beer" ? "Draft status" : "Service status";
  const serviceClosed = itemCategory(wine) === "beer" ? "Reserve keg" : "Unopened";
  $("#detailView").innerHTML = `
    <a class="back-link" href="${backHref}">${copy.back}</a>
    <section class="detail-hero">
      <div>
        <p class="eyebrow">${escapeHtml(wine.type)} / ${escapeHtml(wine.country)}</p>
        <h1>${escapeHtml(wine.name)}</h1>
        <p class="subtitle">${escapeHtml(wine.vintage)} / ${escapeHtml(wine.region)} / ${escapeHtml(wine.grapes)}</p>
      </div>
      <div class="score-panel">
        <span>${wine.score}</span>
        <small>${copy.scoreLabel}</small>
      </div>
    </section>
    <section class="detail-grid">
      ${showServiceStatus ? `
        <article class="service-status ${open ? "is-open" : ""}">
          <h2>${serviceTitle}</h2>
          <strong>${open ? copy.openNow : serviceClosed}</strong>
          <p>${open ? copy.openActive : copy.openHelp}</p>
          <div class="service-actions">
            <button data-open-status="true" ${open ? "disabled" : ""}>${itemCategory(wine) === "beer" ? "Mark on tap" : "Mark open"}</button>
            <button data-open-status="false" ${open ? "" : "disabled"}>${itemCategory(wine) === "beer" ? "Move to reserve" : "Clear"}</button>
          </div>
        </article>
      ` : ""}
      <article class="large-panel">
        <h2>Tasting note</h2>
        <p>${escapeHtml(wine.notes)}</p>
        <div class="tags">${(wine.pairings || []).map((pairing) => `<span>${escapeHtml(pairing)}</span>`).join("")}</div>
      </article>
      <article>
        <h2>${unit[0].toUpperCase()}${unit.slice(1)} count</h2>
        <div class="bottle-control">
          <button data-count="-1" aria-label="Remove one bottle">-</button>
          <strong>${count}</strong>
          <button data-count="1" aria-label="Add one bottle">+</button>
        </div>
        <p>${copy.storageSaved}</p>
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
        <textarea id="guestNote" placeholder="Private tasting note for this item...">${escapeHtml(guestNote(wine))}</textarea>
        <button class="save-note" data-save-note>Save shared note</button>
      </article>
    </section>
  `;

  $("#detailView").querySelectorAll("[data-count]").forEach((button) => {
    button.addEventListener("click", () => updateBottleCount(wine, count + Number(button.dataset.count)));
  });
  $("#detailView").querySelectorAll("[data-open-status]").forEach((button) => {
    button.addEventListener("click", () => updateOpenStatus(wine, button.dataset.openStatus === "true"));
  });
  $("#guestNote").addEventListener("input", (event) => localStorage.setItem(noteKey(wine), event.target.value));
  $("#detailView").querySelector("[data-save-note]").addEventListener("click", () => updateGuestNote(wine, $("#guestNote").value));
  document.querySelectorAll("[data-nav]").forEach((link) => link.classList.toggle("active", link.dataset.nav === navForActiveCategory()));
}

function navForActiveCategory() {
  if (activeCategory === "beer") return "beer";
  if (activeCategory === "spirits") return "spirits";
  return "cellar";
}

function showView(name) {
  if (name === "adminView" && sessionStorage.getItem(EDITOR_UNLOCK_KEY) !== "true") {
    name = "cellarView";
  }

  ["cellarView", "detailView", "guideView", "adminView"].forEach((id) => {
    const view = $(`#${id}`);
    if (view) view.classList.add("hidden");
  });
  const nextView = $(`#${name}`) || $("#cellarView");
  if (nextView) nextView.classList.remove("hidden");
  const activeNav = name === "adminView" ? "admin" : navForActiveCategory();
  document.querySelectorAll("[data-nav]").forEach((link) => link.classList.toggle("active", link.dataset.nav === activeNav));
}

async function renderRoute() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/item/") || hash.startsWith("#/wine/")) {
    showView("detailView");
    renderDetail(hash.replace("#/item/", "").replace("#/wine/", ""));
  } else if (hash === "#/beer") {
    activeCategory = "beer";
    fillFilters();
    render();
    showView("cellarView");
  } else if (hash === "#/top-shelf") {
    activeCategory = "spirits";
    fillFilters();
    render();
    showView("cellarView");
  } else if (hash === "#/admin") {
    const unlocked = await unlockEditor();
    if (!unlocked) {
      location.hash = activeCategory === "beer" ? "#/beer" : activeCategory === "spirits" ? "#/top-shelf" : "#/";
      return;
    }
    if (catalogTarget) catalogTarget.value = activeCategory;
    updateEditorCopy();
    showView("adminView");
    syncEditor();
  } else {
    activeCategory = "wine";
    fillFilters();
    render();
    showView("cellarView");
  }
}

function fillFilters() {
  typeFilter.innerHTML = '<option value="all">All styles</option>';
  countryFilter.innerHTML = '<option value="all">All countries</option>';
  const items = activeItems();
  [...new Set(items.map((wine) => wine.type))].sort().forEach((type) => {
    typeFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`);
  });
  [...new Set(items.map((wine) => wine.country))].sort().forEach((country) => {
    countryFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`);
  });
  if (![...typeFilter.options].some((option) => option.value === state.type)) typeFilter.value = "all";
  if (![...countryFilter.options].some((option) => option.value === state.country)) countryFilter.value = "all";
}

function syncEditor() {
  wines.forEach((wine) => {
    wine.bottles = storedBottleCount(wine);
    wine.open_decanted = isOpenOrDecanted(wine);
    wine.guest_note = guestNote(wine);
  });
  jsonEditor.value = JSON.stringify(wines, null, 2);
}

function applyEditorJson() {
  try {
    const parsed = JSON.parse(jsonEditor.value);
    if (!Array.isArray(parsed)) throw new Error("The top-level JSON must be an array.");
    wines = parsed.map(normalizeWine);
    setCatalogDirty(true);
    fillFilters();
    editorStatus.textContent = "Valid JSON. Unsaved preview updated.";
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
  document.querySelector('[data-nav="admin"]')?.addEventListener("click", async (event) => {
    if (sessionStorage.getItem(EDITOR_UNLOCK_KEY) === "true") return;
    event.preventDefault();
    const unlocked = await unlockEditor();
    if (unlocked) location.hash = "#/admin";
  });
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
  $("#saveCatalog").addEventListener("click", saveCatalogToSupabase);
  $("#enrichWine").addEventListener("click", enrichWineDraft);
  $("#addWine").addEventListener("click", addManualWineDraft);
  catalogTarget?.addEventListener("change", updateEditorCopy);
  $("#newWinePhoto").addEventListener("change", (event) => captureSelectedPhotos(event, "camera"));
  $("#newWineLibrary").addEventListener("change", (event) => captureSelectedPhotos(event, "library"));
  $("#resetJson").addEventListener("click", () => {
    wines = structuredClone(originalWines);
    previewWineIds = new Set();
    setCatalogDirty(false);
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

loadWineCatalog()
  .then(async (data) => {
    wines = data;
    originalWines = structuredClone(data);
    await loadSharedState();
    fillFilters();
    bindEvents();
    syncEditor();
    render();
    renderRoute();
  })
  .catch(() => {
    grid.innerHTML = "<article class=\"empty-state\"><h3>Wine data could not be loaded</h3><p>Check that wines.json is deployed beside index.html.</p></article>";
  });
