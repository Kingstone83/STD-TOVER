const state = {
  items: [],
  activeId: null,
  filter: "all",
  category: "all",
  query: "",
};

const el = {
  countBadge: document.querySelector("#countBadge"),
  searchInput: document.querySelector("#searchInput"),
  categorySelect: document.querySelector("#categorySelect"),
  advisorQuestion: document.querySelector("#advisorQuestion"),
  advisorButton: document.querySelector("#advisorButton"),
  advisorClear: document.querySelector("#advisorClear"),
  advisorAnswer: document.querySelector("#advisorAnswer"),
  resultMeta: document.querySelector("#resultMeta"),
  results: document.querySelector("#results"),
  viewerFolder: document.querySelector("#viewerFolder"),
  viewerName: document.querySelector("#viewerName"),
  previewWrap: document.querySelector("#previewWrap"),
  previewImage: document.querySelector("#previewImage"),
  pdfFrame: document.querySelector("#pdfFrame"),
  downloadButton: document.querySelector("#downloadButton"),
  openButton: document.querySelector("#openButton"),
  filters: document.querySelectorAll(".filter"),
};

init();

async function init() {
  setButtonsEnabled(false);

  try {
    const response = await fetch("data/index.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    state.items = await response.json();
    state.items.sort((a, b) => a.title.localeCompare(b.title, "it", { sensitivity: "base" }));
    el.countBadge.textContent = `${state.items.length} PDF`;
    populateCategories();
    bindEvents();
    render();
  } catch (error) {
    el.resultMeta.textContent = "Indice non trovato. Esegui npm run sync.";
    el.results.innerHTML = `<div class="no-results">Impossibile caricare il database delle schede.</div>`;
    console.error(error);
  }
}

function bindEvents() {
  el.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    render();
  });

  el.categorySelect.addEventListener("change", (event) => {
    state.category = event.target.value;
    render();
  });

  el.advisorButton.addEventListener("click", answerAdvisor);
  el.advisorClear.addEventListener("click", () => {
    el.advisorQuestion.value = "";
    el.advisorAnswer.innerHTML = "";
  });
  el.advisorQuestion.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      answerAdvisor();
    }
  });

  for (const button of el.filters) {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      for (const filter of el.filters) {
        filter.classList.toggle("is-active", filter === button);
      }
      render();
    });
  }
}

function answerAdvisor() {
  const question = el.advisorQuestion.value.trim();
  const meaningfulTerms = getMeaningfulTerms(question);

  if (meaningfulTerms.length < 2) {
    el.advisorAnswer.innerHTML = `
      <p class="advisor-note">Scrivi il lavoro da fare indicando superficie, sottofondo o problema.</p>
    `;
    return;
  }

  const advice = buildAdvice(question);
  if (!advice.length) {
    el.advisorAnswer.innerHTML = `
      <p class="advisor-note">Non ho trovato schede abbastanza pertinenti. Prova con parole come parquet, LVT, sportivo, esterno, primer, colla, cera o pulizia.</p>
    `;
    return;
  }

  el.advisorAnswer.innerHTML = `
    <p class="advisor-note">In base alle schede tecniche, partirei da questi prodotti. Apri sempre la scheda prima dell'uso.</p>
    <div class="advisor-list">
      ${advice.map(renderAdviceCard).join("")}
    </div>
  `;

  for (const button of el.advisorAnswer.querySelectorAll("[data-advisor-id]")) {
    button.addEventListener("click", () => selectItem(button.dataset.advisorId));
  }
}

function buildAdvice(question) {
  const profile = getQuestionProfile(question);
  const preferredItems = profile.categories.length
    ? state.items.filter((item) => profile.categories.includes(item.category))
    : state.items;
  const sourceItems = preferredItems.length >= 3 ? preferredItems : state.items;

  return sourceItems
    .map((item) => ({ item, score: scoreAdviceItem(item, profile) }))
    .filter(({ score }) => score >= 12)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "it", { sensitivity: "base" }))
    .slice(0, 4)
    .map(({ item, score }) => ({
      item,
      score,
      reason: getAdviceReason(item, profile),
      snippet: getBestQuestionSnippet(item, profile.terms),
    }));
}

function renderAdviceCard(advice) {
  const { item, reason, snippet } = advice;
  return `
    <article class="advisor-card">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.category || "Altro")}${item.revision ? ` - rev. ${escapeHtml(item.revision)}` : ""}</span>
      </div>
      <p>${escapeHtml(reason)}</p>
      ${snippet ? `<blockquote>${escapeHtml(snippet)}</blockquote>` : ""}
      <button type="button" data-advisor-id="${escapeHtml(item.id)}">Apri scheda</button>
    </article>
  `;
}

function getQuestionProfile(question) {
  const normalized = normalize(question);
  const baseTerms = getMeaningfulTerms(question);
  const expanded = new Set(baseTerms);
  const categories = new Set();

  for (const intent of ADVISOR_INTENTS) {
    if (intent.triggers.some((trigger) => normalized.includes(trigger))) {
      for (const term of intent.terms) expanded.add(term);
      for (const category of intent.categories) categories.add(category);
    }
  }

  return {
    normalized,
    terms: [...expanded],
    baseTerms,
    categories: [...categories],
  };
}

function scoreAdviceItem(item, profile) {
  const title = normalize(item.title);
  const category = item.category || "";
  const normalizedCategory = normalize(category);
  const text = normalize(item.searchText || "");
  let score = 0;

  if (profile.categories.includes(category)) score += 26;
  if (profile.categories.length && !profile.categories.includes(category)) score -= 12;
  if (profile.normalized && title.includes(profile.normalized)) score += 40;

  for (const term of profile.terms) {
    if (title.split(" ").includes(term)) score += 14;
    else if (title.includes(term)) score += 9;
    if (normalizedCategory.includes(term)) score += 7;
    if (text.includes(term)) score += profile.baseTerms.includes(term) ? 5 : 2;
  }

  for (const term of profile.baseTerms) {
    if (text.includes(term)) score += 4;
  }

  if (item.isOutOfList) score -= 8;
  return score;
}

function getAdviceReason(item, profile) {
  if (profile.categories.includes(item.category)) {
    return `Categoria coerente con la richiesta: ${item.category}.`;
  }

  const matched = profile.baseTerms.filter((term) => normalize(item.searchText || "").includes(term)).slice(0, 3);
  if (matched.length) {
    return `La scheda contiene riferimenti a: ${matched.join(", ")}.`;
  }

  return "Prodotto collegato alle parole della richiesta.";
}

function getBestQuestionSnippet(item, terms) {
  if (!item.searchText) return "";

  const words = item.searchText.replace(/\s+/g, " ").split(" ");
  const index = words.findIndex((word) => terms.some((term) => normalize(word).includes(term)));
  if (index === -1) return "";

  const start = Math.max(0, index - 10);
  const end = Math.min(words.length, index + 28);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < words.length ? " ..." : "";
  return `${prefix}${words.slice(start, end).join(" ")}${suffix}`;
}

function populateCategories() {
  const counts = new Map();
  for (const item of state.items) {
    const category = item.category || "Altro";
    counts.set(category, (counts.get(category) || 0) + 1);
  }

  const options = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "it", { sensitivity: "base" }))
    .map(([category, count]) => `<option value="${escapeHtml(category)}">${escapeHtml(category)} (${count})</option>`);

  el.categorySelect.innerHTML = `<option value="all">Tutte le categorie</option>${options.join("")}`;
}

function render() {
  const matches = getMatches();
  const queryLabel = state.query ? ` per "${state.query}"` : "";
  el.resultMeta.textContent = `${matches.length} risultat${matches.length === 1 ? "o" : "i"}${queryLabel}`;

  if (!matches.length) {
    el.results.innerHTML = `<div class="no-results">Nessuna scheda trovata.</div>`;
    return;
  }

  el.results.innerHTML = matches.map(renderResult).join("");
  for (const button of el.results.querySelectorAll(".result-item")) {
    button.addEventListener("click", () => selectItem(button.dataset.id));
  }

  if (!state.activeId && matches.length === 1) {
    selectItem(matches[0].id);
  }
}

function getMatches() {
  const query = normalize(state.query);
  const terms = query.split(" ").filter(Boolean);

  return state.items
    .filter((item) => {
      if (state.filter === "current" && item.isOutOfList) return false;
      if (state.filter === "out" && !item.isOutOfList) return false;
      if (state.category !== "all" && item.category !== state.category) return false;
      if (!terms.length) return true;
      const haystack = normalize(`${item.title} ${item.fileName} ${item.folder} ${item.category ?? ""} ${item.revision ?? ""} ${item.searchText ?? ""}`);
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => scoreItem(b, query, terms) - scoreItem(a, query, terms) || a.title.localeCompare(b.title, "it", { sensitivity: "base" }));
}

function renderResult(item) {
  const isSelected = item.id === state.activeId;
  const details = [
    item.revision ? `rev. ${escapeHtml(item.revision)}` : null,
    item.category ? escapeHtml(item.category) : null,
    item.sizeLabel,
    item.folder,
  ].filter(Boolean);
  const snippet = getSnippet(item);
  const tagClass = item.isOutOfList ? "tag out" : "tag";
  const tagText = item.isOutOfList ? "Fuori" : "STD";

  return `
    <button class="result-item${isSelected ? " is-selected" : ""}" type="button" data-id="${escapeHtml(item.id)}">
      <span>
        <span class="result-name">${highlight(item.title)}</span>
        <span class="result-details">${details.map((detail) => `<span>${detail}</span>`).join("")}</span>
        ${snippet ? `<span class="result-snippet">${highlight(snippet)}</span>` : ""}
      </span>
      <span class="${tagClass}">${tagText}</span>
    </button>
  `;
}

function selectItem(id) {
  const item = state.items.find((candidate) => candidate.id === id);
  if (!item) return;

  state.activeId = id;
  document.body.classList.add("has-selection");
  el.viewerFolder.textContent = item.folder || "STD";
  el.viewerName.textContent = item.title;

  const url = encodeURI(item.path);
  const previewUrl = item.previewPath ? encodeURI(item.previewPath) : "";

  if (previewUrl) {
    el.previewImage.dataset.expected = previewUrl;
    el.previewImage.onerror = () => {
      if (el.previewImage.dataset.expected !== previewUrl) return;
      showPdfFrame(url);
    };
    el.previewImage.src = previewUrl;
    el.previewImage.classList.remove("is-hidden");
    el.pdfFrame.classList.add("is-hidden");
    el.pdfFrame.removeAttribute("src");
  } else {
    showPdfFrame(url);
  }

  el.openButton.href = url;
  el.downloadButton.href = url;
  el.downloadButton.download = item.fileName;
  setButtonsEnabled(true);

  for (const button of el.results.querySelectorAll(".result-item")) {
    button.classList.toggle("is-selected", button.dataset.id === id);
  }
}

function showPdfFrame(url) {
  el.previewImage.removeAttribute("src");
  el.previewImage.classList.add("is-hidden");
  el.pdfFrame.src = `${url}#view=FitH`;
  el.pdfFrame.classList.remove("is-hidden");
}

function setButtonsEnabled(enabled) {
  el.openButton.setAttribute("aria-disabled", String(!enabled));
  el.downloadButton.setAttribute("aria-disabled", String(!enabled));
}

function highlight(value) {
  const safe = escapeHtml(value);
  const query = state.query.trim();
  if (!query) return safe;

  const parts = query.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!parts.length) return safe;

  return safe.replace(new RegExp(`(${parts.join("|")})`, "gi"), "<mark>$1</mark>");
}

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\-./'&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreItem(item, query, terms) {
  if (!query) return 0;

  const title = normalize(item.title);
  const fileName = normalize(item.fileName);
  const category = normalize(item.category || "");
  const searchText = normalize(item.searchText || "");
  let score = 0;

  if (title === query) score += 120;
  if (title.startsWith(query)) score += 80;
  if (title.includes(query)) score += 60;
  if (fileName.includes(query)) score += 25;
  if (category.includes(query)) score += 18;
  if (searchText.includes(query)) score += 10;

  for (const term of terms) {
    if (title.split(" ").includes(term)) score += 12;
    if (title.startsWith(term)) score += 8;
    if (title.includes(term)) score += 3;
    if (category.includes(term)) score += 4;
    if (searchText.includes(term)) score += 1;
  }

  return score;
}

function getSnippet(item) {
  const query = normalize(state.query);
  if (!query || !item.searchText) return "";

  const titleAndFile = normalize(`${item.title} ${item.fileName} ${item.category || ""}`);
  if (query && titleAndFile.includes(query)) return "";

  const terms = query.split(" ").filter(Boolean);
  const words = item.searchText.replace(/\s+/g, " ").split(" ");
  const index = words.findIndex((word) => terms.some((term) => normalize(word).includes(term)));
  if (index === -1) return "";

  const start = Math.max(0, index - 8);
  const end = Math.min(words.length, index + 24);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < words.length ? " ..." : "";

  return `${prefix}${words.slice(start, end).join(" ")}${suffix}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getMeaningfulTerms(value) {
  return normalize(value)
    .split(" ")
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

const STOP_WORDS = new Set([
  "che",
  "cosa",
  "come",
  "con",
  "dei",
  "del",
  "della",
  "delle",
  "devo",
  "fare",
  "per",
  "posso",
  "quale",
  "questo",
  "serve",
  "sul",
  "sulla",
  "su",
  "una",
  "uno",
  "uso",
  "usare",
]);

const ADVISOR_INTENTS = [
  {
    triggers: ["incoll", "colla", "adesiv", "parquet"],
    categories: ["Adesivi"],
    terms: ["adesivo", "adesivi", "incollaggio", "tovcol", "adesol", "adeblok", "toverfix", "parquet"],
  },
  {
    triggers: ["massetto umido", "umidita", "umido", "anti umido", "impermeabil"],
    categories: ["Fondi & Primer", "Adesivi"],
    terms: ["umidita", "umido", "primer", "anti", "impermeabilizzante", "idroblok", "toverfix", "adeblok"],
  },
  {
    triggers: ["pulire", "pulizia", "lavare", "sporco", "deterg"],
    categories: ["Detergenza & Manutenzione"],
    terms: ["pulizia", "detergente", "cleaner", "pulito", "manutenzione", "lavare", "sporco"],
  },
  {
    triggers: ["verniciare", "verniciatura", "quale vernice", "finitura", "proteggere"],
    categories: ["Vernici & Finiture"],
    terms: ["vernice", "vernici", "finitura", "protezione", "lak", "maxima", "idrolak", "uniqua"],
  },
  {
    triggers: ["sport", "sportivo", "palestra"],
    categories: ["Sport"],
    terms: ["sportfloor", "sportivo", "sportivi", "pavimenti", "grip", "finish"],
  },
  {
    triggers: ["esterno", "esterni", "deck", "terrazza", "giardino", "wpc"],
    categories: ["Esterni & Decking"],
    terms: ["esterno", "deck", "wpc", "giardino", "oil4sun", "pro", "cover"],
  },
  {
    triggers: ["lvt", "vinilico", "vinilici"],
    categories: ["Adesivi", "Stucchi & Rasanti"],
    terms: ["lvt", "filler", "leveller", "tovcol", "fugante"],
  },
  {
    triggers: ["fuga", "fughe", "stucco", "riempire", "rasare", "livellare"],
    categories: ["Stucchi & Rasanti"],
    terms: ["stucco", "filler", "fugante", "leveller", "rasante", "autolivellante"],
  },
  {
    triggers: ["olio", "oliato", "cera", "cerare", "ravvivare"],
    categories: ["Oli & Cere"],
    terms: ["olio", "oil", "cera", "wax", "ravvivante", "rinovoil"],
  },
  {
    triggers: ["colorare", "colore", "tingere", "tinta"],
    categories: ["Coloranti"],
    terms: ["color", "colore", "tingo", "tintoretto", "xilocolor", "pasta"],
  },
];
