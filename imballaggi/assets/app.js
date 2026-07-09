const state = {
  products: [],
  metadata: {},
  query: "",
  source: "all",
  category: "all",
  client: "all",
  activeId: null,
};

const el = {
  countBadge: document.querySelector("#countBadge"),
  searchInput: document.querySelector("#searchInput"),
  sourceFilter: document.querySelector("#sourceFilter"),
  categoryFilter: document.querySelector("#categoryFilter"),
  clientFilter: document.querySelector("#clientFilter"),
  resultMeta: document.querySelector("#resultMeta"),
  results: document.querySelector("#results"),
  productPage: document.querySelector("#productPage"),
};

init();

async function init() {
  try {
    const response = await fetch("data/products.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    state.products = payload.products || [];
    state.metadata = payload.metadata || {};
    el.countBadge.textContent = `${state.products.length} schede`;
    populateFilters();
    bindEvents();
    render();
  } catch (error) {
    el.resultMeta.textContent = "Impossibile caricare i dati imballaggio.";
    el.results.innerHTML = `<div class="no-results">Controlla che il file dati sia presente.</div>`;
    console.error(error);
  }
}

function bindEvents() {
  el.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    render();
  });

  el.sourceFilter.addEventListener("change", (event) => {
    state.source = event.target.value;
    render();
  });

  el.categoryFilter.addEventListener("change", (event) => {
    state.category = event.target.value;
    render();
  });

  el.clientFilter.addEventListener("change", (event) => {
    state.client = event.target.value;
    render();
  });
}

function populateFilters() {
  const categories = state.metadata.categories || [];
  el.categoryFilter.innerHTML = `<option value="all">Tutte le categorie</option>${categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("")}`;

  const clients = state.metadata.clients || [];
  el.clientFilter.innerHTML = `<option value="all">Tutti i clienti</option>${clients
    .map((client) => `<option value="${escapeHtml(client)}">${escapeHtml(client)}</option>`)
    .join("")}`;
}

function render() {
  const matches = getMatches();
  const queryLabel = state.query ? ` per "${state.query}"` : "";
  el.resultMeta.textContent = `${matches.length} sched${matches.length === 1 ? "a" : "e"}${queryLabel}`;

  if (!matches.length) {
    state.activeId = null;
    el.results.innerHTML = `<div class="no-results">Nessun prodotto trovato.</div>`;
    renderEmpty();
    return;
  }

  if (!state.activeId || !matches.some((item) => item.id === state.activeId)) {
    state.activeId = matches[0].id;
  }

  el.results.innerHTML = matches.map(renderResult).join("");
  for (const button of el.results.querySelectorAll(".result-card")) {
    button.addEventListener("click", () => {
      state.activeId = button.dataset.id;
      render();
      if (window.matchMedia("(max-width: 980px)").matches) {
        el.productPage.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  const active = state.products.find((product) => product.id === state.activeId);
  if (active) renderProduct(active);
}

function getMatches() {
  const query = normalize(state.query);
  const terms = query.split(" ").filter(Boolean);

  return state.products
    .filter((product) => {
      if (state.source !== "all" && product.type !== state.source) return false;
      if (state.category !== "all" && product.macro !== state.category) return false;
      if (state.client !== "all" && product.client !== state.client) return false;
      if (!terms.length) return true;
      const haystack = normalize(product.searchText || "");
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => scoreProduct(b, query, terms) - scoreProduct(a, query, terms) || a.title.localeCompare(b.title, "it", { sensitivity: "base" }));
}

function renderResult(product) {
  const isSelected = product.id === state.activeId;
  const typeLabel = product.type === "cliente" ? "Cliente" : "TOVER";
  const details = [
    product.productCode ? `cod. ${escapeHtml(product.productCode)}` : null,
    product.macro ? escapeHtml(product.macro) : null,
    `${product.formatsCount} format${product.formatsCount === 1 ? "o" : "i"}`,
  ].filter(Boolean);

  return `
    <button class="result-card${isSelected ? " is-selected" : ""}" type="button" data-id="${escapeHtml(product.id)}">
      <span class="result-top">
        <span class="result-title">${highlight(product.title)}</span>
        <span class="tag${product.type === "cliente" ? " client" : ""}">${typeLabel}</span>
      </span>
      <span class="result-subtitle">${escapeHtml(product.subtitle || product.toverProduct || "")}</span>
      <span class="result-details">${details.map((detail) => `<span>${detail}</span>`).join("")}</span>
    </button>
  `;
}

function renderProduct(product) {
  const updated = formatDate(state.metadata.updatedAt);
  const badges = [
    `<span class="badge${product.type === "cliente" ? " client" : ""}">${product.type === "cliente" ? "Marchio cliente" : "TOVER"}</span>`,
    product.macro ? `<span class="badge neutral">${escapeHtml(product.macro)}</span>` : "",
    updated ? `<span class="badge neutral">Agg. ${updated}</span>` : "",
  ].join("");

  el.productPage.innerHTML = `
    <article class="sheet">
      <header class="sheet-hero">
        <div class="sheet-kicker">${badges}</div>
        <h2 class="sheet-title">${escapeHtml(product.title)}</h2>
        <p class="sheet-subtitle">${escapeHtml(product.subtitle || product.micro || product.toverProduct || "")}</p>
        <div class="actions">
          <button class="action-button primary" type="button" id="printButton">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" />
            </svg>
            Stampa scheda
          </button>
          <button class="action-button" type="button" id="copyCodesButton">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M8 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2M6 7h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
            </svg>
            Copia codici
          </button>
        </div>
      </header>

      <div class="sheet-body">
        <section class="info-grid" aria-label="Dati prodotto">
          ${renderInfoBox("Marchio", product.brand || "TOVER")}
          ${renderInfoBox("Prodotto TOVER", product.toverProduct || product.title)}
          ${renderInfoBox("Codice prodotto", product.productCode || "-")}
          ${renderInfoBox("Formati", String(product.formatsCount))}
          ${product.client ? renderInfoBox("Cliente", product.client) : ""}
          ${product.micro ? renderInfoBox("Microcategoria", product.micro) : ""}
        </section>

        <section>
          <h3 class="section-title"><span>Dettaglio tecnico</span>Formati e imballi</h3>
        </section>

        <section class="formats" aria-label="Formati e imballi">
          ${product.rows.map((row, index) => renderFormat(row, index)).join("")}
        </section>
      </div>
    </article>
  `;

  document.querySelector("#printButton")?.addEventListener("click", () => window.print());
  document.querySelector("#copyCodesButton")?.addEventListener("click", () => copyCodes(product));
}

function renderInfoBox(label, value) {
  return `
    <div class="info-box">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `;
}

function renderFormat(row, index) {
  const packageText = formatDescription(row.packageType, row.packageDescription);
  const capText = formatDescription(row.capType, row.capDescription);

  return `
    <article class="format-card">
      <div class="format-head">
        <span class="format-size">${escapeHtml(row.size || `Voce ${index + 1}`)}</span>
        ${row.component ? `<span class="format-component">Componente ${escapeHtml(row.component)}</span>` : ""}
      </div>
      <div class="pack-grid">
        <div class="pack-block">
          <h3>Imballo</h3>
          <p>${escapeHtml(packageText || "-")}</p>
          ${row.packageCode ? `<span class="code">${escapeHtml(row.packageCode)}</span>` : ""}
        </div>
        <div class="pack-block">
          <h3>Tappo / coperchio</h3>
          <p>${escapeHtml(capText || "-")}</p>
          ${row.capCode ? `<span class="code">${escapeHtml(row.capCode)}</span>` : ""}
        </div>
      </div>
      ${row.notes ? `<p class="note">${escapeHtml(row.notes)}</p>` : ""}
    </article>
  `;
}

function formatDescription(shortText, longText) {
  if (!shortText) return longText || "";
  if (!longText || normalize(shortText) === normalize(longText)) return shortText;
  return `${shortText} - ${longText}`;
}

function renderEmpty() {
  el.productPage.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">IMB</div>
      <p>Cerca un prodotto e seleziona una scheda per vedere imballi, codici e formati.</p>
    </div>
  `;
}

async function copyCodes(product) {
  const lines = product.rows.flatMap((row) => {
    const size = row.size || "Voce senza formato";
    return [
      row.packageCode ? `${product.title} | ${size} | imballo: ${row.packageCode}` : "",
      row.capCode ? `${product.title} | ${size} | tappo: ${row.capCode}` : "",
    ].filter(Boolean);
  });

  if (!lines.length) {
    showToast("Nessun codice da copiare.");
    return;
  }

  try {
    await navigator.clipboard.writeText(lines.join("\\n"));
    showToast("Codici copiati.");
  } catch {
    showToast("Copia non disponibile in questo browser.");
  }
}

function showToast(message) {
  const oldToast = document.querySelector(".toast");
  oldToast?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

function scoreProduct(product, query, terms) {
  if (!query) return 0;
  const title = normalize(product.title);
  const code = normalize(product.productCode || "");
  const client = normalize(product.client || "");
  const tover = normalize(product.toverProduct || "");
  const search = normalize(product.searchText || "");
  let score = 0;

  if (title === query) score += 120;
  if (title.startsWith(query)) score += 90;
  if (title.includes(query)) score += 70;
  if (code.includes(query)) score += 45;
  if (client.includes(query)) score += 30;
  if (tover.includes(query)) score += 25;
  if (search.includes(query)) score += 15;

  for (const term of terms) {
    if (title.split(" ").includes(term)) score += 12;
    if (title.includes(term)) score += 7;
    if (code.includes(term)) score += 8;
    if (search.includes(term)) score += 2;
  }

  return score;
}

function highlight(value) {
  const safe = escapeHtml(value || "");
  const query = state.query.trim();
  if (!query) return safe;

  const parts = query.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!parts.length) return safe;
  return safe.replace(new RegExp(`(${parts.join("|")})`, "gi"), "<mark>$1</mark>");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_./'&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
