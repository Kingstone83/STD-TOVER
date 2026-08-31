(function () {
  const data = window.STD_DATA || { products: [], categories: [] };
  const extraData = window.STD_EXTRA || { products: {}, priceList: {} };
  const state = {
    category: "Tutte",
    query: "",
    hideDiscontinued: false,
    selectedId: null,
  };

  const els = {
    dataStatus: document.getElementById("dataStatus"),
    categoryList: document.getElementById("categoryList"),
    productSearch: document.getElementById("productSearch"),
    clearSearch: document.getElementById("clearSearch"),
    hideDiscontinued: document.getElementById("hideDiscontinued"),
    productList: document.getElementById("productList"),
    productDetail: document.getElementById("productDetail"),
    resultCount: document.getElementById("resultCount"),
    questionInput: document.getElementById("questionInput"),
    askButton: document.getElementById("askButton"),
    resetQuestion: document.getElementById("resetQuestion"),
    answerPanel: document.getElementById("answerPanel"),
    topicSelect: document.getElementById("topicSelect"),
  };

  const fieldLabels = {
    resa_consumo: "Resa / consumo",
    uso_impiego: "Uso / impiego",
    posa: "Posa / incollaggio",
    preparazione: "Preparazione sottofondo",
    tempi: "Tempi",
    temperatura: "Temperatura / umidità",
    pulizia: "Pulizia",
    note_limiti: "Note e limiti",
  };

  const topicTerms = {
    resa_consumo: ["resa", "consumo", "consumi", "g/m", "m2", "m²", "litro", "kg"],
    uso_impiego: ["uso", "impiego", "utilizzo", "applicazione", "applicare", "modalita", "diluire", "mescolare", "rullo", "spatola", "pennello"],
    posa: ["posa", "incollaggio", "parquet", "legno", "pvc", "lvt", "resilienti", "sintetici", "sottofondo", "massetto", "pavimento"],
    preparazione: ["preparazione", "sottofondo", "supporto", "pulire", "aspirare", "carteggiare", "massetto", "primer"],
    tempi: ["tempo", "tempi", "pedonabilita", "secco", "asciugatura", "sovraverniciatura", "levigatura", "esercizio", "indurimento"],
    temperatura: ["temperatura", "gelo", "umidita", "u.r", "°c"],
    pulizia: ["pulizia", "pulire", "lavaggio", "attrezzi", "residui", "stripcoll"],
    note_limiti: ["non", "evitare", "note", "limiti", "idoneo", "attenzione", "avvertenze"],
  };

  function productExtra(product) {
    return extraData.products?.[product.id] || {};
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9°²/&.]+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function productHaystack(product) {
    return normalize([
      product.name,
      product.subtitle,
      product.category,
      product.source,
      product.text,
    ].join(" "));
  }

  function queryTokens(query) {
    return normalize(query).split(/\s+/).filter((token) => token.length > 1);
  }

  function detectTopics(query) {
    const selected = els.topicSelect.value;
    if (selected !== "auto") return [selected];
    const norm = normalize(query);
    const scored = Object.entries(topicTerms).map(([topic, terms]) => {
      const score = terms.reduce((sum, term) => sum + (norm.includes(normalize(term)) ? 1 : 0), 0);
      return { topic, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    return scored.length ? scored.slice(0, 3).map((item) => item.topic) : ["uso_impiego"];
  }

  function scoreProduct(product, query, topics) {
    const tokens = queryTokens(query);
    const normQuery = normalize(query);
    const haystack = productHaystack(product);
    const name = normalize(product.name);
    let score = 0;
    if (name && normQuery.includes(name)) score += 120;
    tokens.forEach((token) => {
      if (name.includes(token)) score += 18;
      if (normalize(product.subtitle).includes(token)) score += 8;
      if (normalize(product.category).includes(token)) score += 6;
      const hits = haystack.split(token).length - 1;
      score += Math.min(hits, 8);
    });
    topics.forEach((topic) => {
      (topicTerms[topic] || []).forEach((term) => {
      if (haystack.includes(normalize(term))) score += 0.8;
      });
      if ((product.fields[topic] || []).length) score += 8;
    });
    return score;
  }

  function scoreFragment(fragment, query, topics) {
    const norm = normalize(fragment);
    let score = 0;
    queryTokens(query).forEach((token) => {
      if (norm.includes(token)) score += 3;
    });
    topics.forEach((topic) => {
      (topicTerms[topic] || []).forEach((term) => {
        if (norm.includes(normalize(term))) score += 1.5;
      });
    });
    return score;
  }

  function snippetsFor(product, query, topics) {
    const fieldSnippets = topics.flatMap((topic) => {
      return (product.fields[topic] || []).slice(0, 2);
    });
    const candidates = product.fragments
      .map((fragment) => ({ fragment, score: scoreFragment(fragment, query, topics) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => item.fragment);
    const merged = [...fieldSnippets, ...candidates];
    return [...new Set(merged)].slice(0, 4);
  }

  function filteredProducts() {
    const tokens = queryTokens(state.query);
    return data.products
      .filter((product) => state.category === "Tutte" || product.category === state.category)
      .filter((product) => !state.hideDiscontinued || !product.fuoriListino)
      .filter((product) => {
        if (!tokens.length) return true;
        const haystack = productHaystack(product);
        return tokens.every((token) => haystack.includes(token));
      })
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  }

  function renderCategories() {
    const categories = ["Tutte", ...data.categories];
    els.categoryList.innerHTML = categories.map((category) => {
      const count = category === "Tutte"
        ? data.products.length
        : data.products.filter((product) => product.category === category).length;
      return `
        <button class="category-button ${state.category === category ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">
          <span>${escapeHtml(category)}</span>
          <strong>${count}</strong>
        </button>`;
    }).join("");
  }

  function renderProducts() {
    const products = filteredProducts();
    els.resultCount.textContent = `${products.length} risultati`;
    if (!products.length) {
      els.productList.innerHTML = `<div class="empty-state">Nessun prodotto trovato con i filtri attuali.</div>`;
      return;
    }
    els.productList.innerHTML = products.map((product) => `
      <button class="product-card ${state.selectedId === product.id ? "active" : ""} ${productExtra(product).image ? "" : "no-image"}" type="button" data-product-id="${escapeHtml(product.id)}">
        ${productExtra(product).image ? `<img src="${escapeHtml(productExtra(product).image)}" alt="${escapeHtml(product.name)}" loading="lazy">` : ""}
        <div>
          <strong>${escapeHtml(product.name)}</strong>
          <span>${escapeHtml(product.subtitle || product.source)}</span>
          <div class="pill-row">
            <span class="pill">${escapeHtml(product.category)}</span>
            ${product.fuoriListino ? `<span class="pill warn">Fuori listino</span>` : ""}
          </div>
        </div>
      </button>
    `).join("");
  }

  function renderDetail(product) {
    if (!product) {
      els.productDetail.innerHTML = `<div class="empty-state large">Seleziona un prodotto per leggere i dati estratti dalla scheda.</div>`;
      return;
    }

    const fields = Object.entries(fieldLabels)
      .map(([key, label]) => {
        const snippets = product.fields[key] || [];
        if (!snippets.length) return "";
        return `
          <section class="field-card">
            <h3>${escapeHtml(label)}</h3>
            <p>${escapeHtml(snippets[0])}</p>
          </section>`;
      })
      .filter(Boolean)
      .join("");

    els.productDetail.innerHTML = `
      <header class="detail-title ${productExtra(product).image ? "detail-with-image" : ""}">
        <div>
          <div class="pill-row">
            <span class="pill">${escapeHtml(product.category)}</span>
            ${product.fuoriListino ? `<span class="pill warn">Fuori listino</span>` : ""}
          </div>
          <h2>${escapeHtml(product.name)}</h2>
          <p>${escapeHtml(product.subtitle)}</p>
          <p class="source-line">Fonte PDF: ${escapeHtml(product.relativeFolder === "." ? product.source : `${product.relativeFolder}/${product.source}`)}</p>
        </div>
        ${productExtra(product).image ? `<img class="product-photo" src="${escapeHtml(productExtra(product).image)}" alt="${escapeHtml(product.name)}">` : ""}
      </header>
      <div class="field-grid">${fields || `<div class="empty-state">Nessun campo operativo rilevato automaticamente.</div>`}</div>
      <pre class="full-text">${escapeHtml(product.text.slice(0, 5000))}</pre>
    `;
  }

  function highlight(text, query) {
    let safe = escapeHtml(text);
    queryTokens(query).slice(0, 8).forEach((token) => {
      if (token.length < 3) return;
      const rx = new RegExp(`(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
      safe = safe.replace(rx, "<mark>$1</mark>");
    });
    return safe;
  }

  function productByName(name) {
    const normName = normalize(name);
    return data.products.find((product) => normalize(product.name) === normName);
  }

  function productLead(product) {
    const options = [
      ...(product.fields.uso_impiego || []),
      ...(product.fields.posa || []),
      ...(product.fields.preparazione || []),
      product.subtitle,
    ].filter(Boolean);
    const detail = options.find((item) => !/dati tecnici|aspetto|densit|ph|conservazione|confezioni/i.test(item)) || product.subtitle || product.source;
    return escapeHtml(String(detail)
      .replace(/\bCertificazioni\b/gi, "")
      .replace(/\bModalità d[’']uso\b/gi, "")
      .replace(/\bModalità di applicazione\b/gi, "")
      .replace(/\bDati tecnici[^.]*\./gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 260));
  }

  function productLink(product) {
    return `<button class="inline-product" type="button" data-product-id="${escapeHtml(product.id)}">${escapeHtml(product.name)}</button>`;
  }

  function uniqueProducts(products) {
    const seen = new Set();
    return products.filter((product) => {
      if (!product || seen.has(product.id)) return false;
      seen.add(product.id);
      return true;
    });
  }

  function exactProductsInQuestion(question) {
    const norm = normalize(question);
    return data.products.filter((product) => {
      const name = normalize(product.name);
      return name.length > 2 && norm.includes(name);
    });
  }

  function isEnglishQuestion(question) {
    const norm = normalize(question);
    const englishHits = ["can you", "where", "buy", "best", "either product", "thanks", "recommend", "ireland"].filter((term) => norm.includes(term)).length;
    const italianHits = ["cliente", "prodotto", "acquisto", "dove", "consiglia", "grazie", "pavimento"].filter((term) => norm.includes(term)).length;
    return englishHits > italianHits;
  }

  function hasPurchaseIntent(question) {
    const norm = normalize(question);
    return ["buy", "purchase", "where can", "where to", "acquisto", "acquistare", "comprare", "rivenditore", "distributore", "store", "amazon"].some((term) => norm.includes(normalize(term)));
  }

  function hasComparisonIntent(question) {
    const norm = normalize(question);
    return ["either product", "which product", "which one", "rather than", "instead of", "compare", "comparison", "difference", "better", "prodotto rispetto", "quale prodotto", "quale dei due", "confronto", "meglio", "differenza"].some((term) => norm.includes(normalize(term)));
  }

  function consultationConfidence(question, scored) {
    const exact = exactProductsInQuestion(question);
    const top = scored[0];
    const second = scored[1];
    const topScore = top?.score || 0;
    const secondScore = second?.score || 0;
    const hasClearName = exact.some((product) => product.id === top?.product.id);
    const knownCycle = hasOutdoorWoodContext(question);
    const purchaseNeedsProduct = hasPurchaseIntent(question) && !exact.length;
    const comparisonNeedsProducts = hasComparisonIntent(question) && exact.length < 2 && !knownCycle;
    return {
      exact,
      hasClearName,
      topScore,
      secondScore,
      purchaseNeedsProduct,
      comparisonNeedsProducts,
      knownCycle,
      safe: !purchaseNeedsProduct && !comparisonNeedsProducts && (hasClearName || knownCycle),
    };
  }

  function hasOutdoorWoodContext(question) {
    const norm = normalize(question);
    return ["decking", "bordo piscina", "esterno", "terrazzo", "oil4sun", "pro deck", "legno esterno"].some((term) => norm.includes(normalize(term)));
  }

  function cycleProducts(question, scored) {
    const norm = normalize(question);
    const matched = scored.map((item) => item.product);
    const main = matched[0];
    if (hasOutdoorWoodContext(question)) {
      const treatmentName = main?.name === "Pro-Deck" || norm.includes("pro deck") ? "Pro-Deck" : "Oil4Sun";
      const treatment = productByName(treatmentName) || main;
      return {
        rule: "Legno esterno / decking",
        main: treatment,
        preparation: uniqueProducts(["Re-Wood", "Grey Free"].map(productByName)),
        treatment: uniqueProducts([treatment]),
        maintenance: uniqueProducts(["Deck-Soap"].map(productByName)),
      };
    }
    return {
      rule: "",
      main,
      preparation: [],
      treatment: uniqueProducts([main]),
      maintenance: [],
    };
  }

  function formatProductList(products, fallback) {
    if (!products.length) return escapeHtml(fallback);
    return products.map((product) => `${productLink(product)} - ${productLead(product)}`).join("<br>");
  }

  function formatComparison(products) {
    return products.slice(0, 3).map((product) => `
      <li><strong>${productLink(product)}</strong>: ${productLead(product)}</li>
    `).join("");
  }

  function customerChannel(question, language) {
    const norm = normalize(question);
    const abroad = /\bireland\b|\birlanda\b|\buk\b|\bfrance\b|\bspain\b|\bgermany\b/.test(norm);
    if (language === "en") {
      if (abroad) return "For availability in Ireland, the indexed technical sheets do not list retailers or current stock. Please share the product names and your area, and we can help route the request to the appropriate Tover contact or local distributor.";
      if (/\bprivat/.test(norm)) return "For private purchases, please use the official Tover purchase channels for the products available in your country. If you tell us your location, we can direct you more accurately.";
      return "For purchase information, please share whether you are a private customer or a professional and your location, so we can indicate the correct Tover channel.";
    }
    if (abroad) return "Per disponibilità fuori Italia, le schede tecniche indicizzate non riportano rivenditori o giacenze aggiornate. Indichi i prodotti e la zona: potremo indirizzare la richiesta al contatto Tover o al distributore locale più adatto.";
    if (/\bprivat/.test(norm)) return "Per clienti privati in Italia, può fare riferimento allo Store Amazon Tover per i prodotti disponibili; per disponibilità specifiche è utile indicare prodotto e zona.";
    if (/\bprofessionista|\bposatore|\brivenditore|\bimpresa/.test(norm)) return "Per forniture professionali, la richiesta può essere gestita tramite il referente commerciale Tover di zona.";
    return "Per indicare il canale corretto servono tipologia cliente, zona e prodotto richiesto.";
  }

  function photoRequest(question, language) {
    const norm = normalize(question);
    const diagnosticTerms = ["macchia", "difetto", "ingrigito", "rovinato", "problema", "alone", "stacc", "umidita", "bordo piscina", "decking", "esterno", "non so", "consiglio"];
    if (!diagnosticTerms.some((term) => norm.includes(normalize(term)))) return "";
    if (language === "en") return "To give a reliable final recommendation, please send the wood species, current condition of the surface and photos: one general view, one close detail and, if useful, one photo against the light.";
    return "Per formulare una valutazione definitiva è utile richiedere essenza del legno, stato attuale del supporto e fotografie: una panoramica, un dettaglio ravvicinato e, se possibile, una foto in controluce.";
  }

  function renderBackOfficeReply(question, scored, topics) {
    const confidence = consultationConfidence(question, scored);
    const language = isEnglishQuestion(question) ? "en" : "it";
    if (!confidence.safe) {
      const candidates = scored.slice(0, 3).map(({ product }) => productLink(product)).join(", ");
      const reason = confidence.purchaseNeedsProduct
        ? (language === "en" ? "The request asks where to buy, but it does not name the products clearly." : "La richiesta riguarda l'acquisto, ma non indica chiaramente i prodotti.")
        : confidence.comparisonNeedsProducts
          ? (language === "en" ? "The request refers to a comparison, but the two products are not identified in this message." : "La richiesta sembra chiedere un confronto, ma non identifica i due prodotti da confrontare.")
          : (language === "en" ? "The product and application context are not clear enough." : "Prodotto e contesto applicativo non sono abbastanza chiari.");
      return `
        <article class="answer-card backoffice-card caution-card">
          <h3>${language === "en" ? "Consultation not safe yet" : "Consulenza non ancora sicura"}</h3>
          <div class="backoffice-reply">
            ${language === "en" ? `
              <p>I would not send a final answer yet. ${escapeHtml(reason)}</p>
              <p><strong>Possible products detected:</strong> ${candidates || "no clear product"}.</p>
              <p><strong>Reply to the customer by asking:</strong> which two products they mean, where the project is located in Ireland, whether they are a private customer or professional, and what surface/application the products are for.</p>
              <p class="source-line">This prevents an invented recommendation. Use the technical references below only for internal checking.</p>
            ` : `
              <p>Non preparerei ancora una risposta definitiva. ${escapeHtml(reason)}</p>
              <p><strong>Prodotti forse pertinenti:</strong> ${candidates || "nessun prodotto chiaro"}.</p>
              <p><strong>Prima di rispondere al cliente chiedere:</strong> quali prodotti intende confrontare, zona del lavoro, privato o professionista, supporto/applicazione e fotografie se la richiesta riguarda un problema tecnico.</p>
              <p class="source-line">Questo blocco evita risposte inventate: usare i riferimenti tecnici sotto solo come consultazione interna.</p>
            `}
          </div>
        </article>`;
    }
    const cycle = cycleProducts(question, scored);
    const main = cycle.main;
    const topicLabel = topics.map((topic) => fieldLabels[topic] || "argomento tecnico").join(", ");
    const photoLine = photoRequest(question, language);
    const hasCycle = cycle.preparation.length || cycle.maintenance.length || cycle.rule;
    const purchaseOnly = hasPurchaseIntent(question) && !topics.some((topic) => topic !== "uso_impiego");
    const comparison = hasComparisonIntent(question) && confidence.exact.length >= 2;
    if (language === "en") {
      return `
        <article class="answer-card backoffice-card">
          <h3>Customer reply draft</h3>
          <div class="backoffice-reply">
            <p>Dear Customer,</p>
            ${comparison ? `
              <p>thank you for contacting us. The products identified in your request are ${confidence.exact.map(productLink).join(" and ")}.</p>
              <p><strong>Technical comparison:</strong></p>
              <ul class="cycle-list">${formatComparison(confidence.exact)}</ul>
              <p>Based on the technical sheets alone, I would not choose one over the other without confirming the surface, required finish/performance and site conditions.</p>
            ` : `
              <p>thank you for contacting us. Based on the indexed technical sheets, the product clearly identified in your request is ${productLink(main)}.</p>
              ${purchaseOnly ? "" : `<p><strong>Technical assessment:</strong> ${productLead(main)}</p>`}
            `}
            ${hasCycle && !purchaseOnly && !comparison ? `
              <p><strong>Recommended cycle${cycle.rule ? ` (${escapeHtml(cycle.rule)})` : ""}:</strong></p>
              <ul class="cycle-list">
                <li><strong>Surface preparation:</strong> ${formatProductList(cycle.preparation, "confirm that the surface is clean, dry, sound and suitable before application.")}</li>
                <li><strong>Main treatment:</strong> ${formatProductList(cycle.treatment, "apply the selected product according to the application method, yield and timing stated in the technical sheet.")}</li>
                <li><strong>Routine maintenance:</strong> ${formatProductList(cycle.maintenance, "confirm the finish and use conditions before recommending a maintenance product.")}</li>
              </ul>
            ` : ""}
            <p><strong>Purchase information:</strong> ${escapeHtml(customerChannel(question, language))}</p>
            ${photoLine ? `<p><strong>Useful information:</strong> ${escapeHtml(photoLine)}</p>` : ""}
            <p>Kind regards,<br>Back Office Italia<br>Tover Srl</p>
          </div>
        </article>`;
    }
    return `
      <article class="answer-card backoffice-card">
        <h3>Bozza risposta Back Office</h3>
        <div class="backoffice-reply">
          <p>Gentile Cliente,</p>
          ${comparison ? `
            <p>la ringraziamo per averci contattato. I prodotti identificati nella richiesta sono ${confidence.exact.map(productLink).join(" e ")}.</p>
            <p><strong>Confronto tecnico:</strong></p>
            <ul class="cycle-list">${formatComparison(confidence.exact)}</ul>
            <p>Solo sulla base delle schede tecniche non sceglierei automaticamente un prodotto rispetto all’altro senza confermare supporto, finitura richiesta, prestazioni attese e condizioni di cantiere.</p>
          ` : `
            <p>la ringraziamo per averci contattato. In merito alla sua richiesta, dai riferimenti presenti nelle schede tecniche indicizzate il prodotto più pertinente è ${productLink(main)}.</p>
            <p><strong>Valutazione tecnica:</strong> ${productLead(main)}</p>
          `}
          ${hasCycle && !comparison ? `
            <p><strong>Ciclo consigliato${cycle.rule ? ` (${escapeHtml(cycle.rule)})` : ""}:</strong></p>
            <ul class="cycle-list">
              <li><strong>Preparazione del supporto:</strong> ${formatProductList(cycle.preparation, "verificare che il supporto sia pulito, asciutto, coerente e conforme alle indicazioni della scheda tecnica prima dell'applicazione.")}</li>
              <li><strong>Trattamento principale:</strong> ${formatProductList(cycle.treatment, "applicare il prodotto indicato attenendosi a resa, tempi e modalità riportati in scheda tecnica.")}</li>
              <li><strong>Manutenzione periodica:</strong> ${formatProductList(cycle.maintenance, "indicare un prodotto di manutenzione solo dopo aver confermato finitura e destinazione d’uso.")}</li>
            </ul>
          ` : `
            <p><strong>Ciclo completo:</strong> non indicarlo automaticamente. Per questa richiesta la scheda permette di parlare del prodotto, ma servono supporto, stato del pavimento e finitura desiderata per consigliare preparazione e manutenzione.</p>
          `}
          <p><strong>Canale di acquisto:</strong> ${escapeHtml(customerChannel(question, language))}</p>
          ${photoLine ? `<p><strong>Informazioni utili:</strong> ${escapeHtml(photoLine)}</p>` : ""}
          <p class="source-line">Argomento rilevato: ${escapeHtml(topicLabel)}. La bozza usa solo dati presenti nelle schede indicizzate; verificare sempre eventuali condizioni di cantiere non descritte dal cliente.</p>
          <p>Cordiali saluti,<br>Back Office Italia<br>Tover Srl</p>
        </div>
      </article>`;
  }

  function answerQuestion() {
    const question = els.questionInput.value.trim();
    if (!question) {
      els.answerPanel.className = "answer-panel empty-state";
      els.answerPanel.textContent = "Scrivi una richiesta cliente: l'app preparerà una bozza Back Office con ciclo completo quando tecnicamente pertinente.";
      return;
    }

    const topics = detectTopics(question);
    const scored = data.products
      .filter((product) => !state.hideDiscontinued || !product.fuoriListino)
      .map((product) => ({
        product,
        score: scoreProduct(product, question, topics),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (!scored.length) {
      els.answerPanel.className = "answer-panel empty-state";
      els.answerPanel.textContent = "Non ho trovato un riscontro nelle schede indicizzate. Prova con il nome prodotto o un termine tecnico presente nella scheda.";
      return;
    }

    const cards = scored.map(({ product }) => {
      const snippets = snippetsFor(product, question, topics);
      const evidence = snippets.length
        ? snippets.map((snippet) => `<p class="snippet">${highlight(snippet, question)}</p>`).join("")
        : `<p class="snippet">Il prodotto è pertinente alla domanda, ma il campo specifico non è stato isolato automaticamente. Consulta il testo della scheda prodotto.</p>`;
      return `
        <article class="answer-card">
          <h3>${escapeHtml(product.name)} <span class="muted">- ${escapeHtml(product.category)}</span></h3>
          ${evidence}
          <p class="source-line">Fonte: ${escapeHtml(product.source)}. Risposta limitata ai dati presenti nella scheda.</p>
          <button class="source-button" type="button" data-product-id="${escapeHtml(product.id)}">Apri scheda prodotto</button>
        </article>`;
    }).join("");

    els.answerPanel.className = "answer-panel answer-list";
    const topicLabel = topics.map((topic) => fieldLabels[topic] || "argomento tecnico").join(", ");
    els.answerPanel.innerHTML = `
      ${renderBackOfficeReply(question, scored, topics)}
      <div class="answer-card">
        <h3>Riferimenti tecnici dalle schede</h3>
        <p>Ho trovato i riferimenti più pertinenti per <strong>${escapeHtml(topicLabel)}</strong>. Usa i brani sotto come fonte: se un valore non compare nei brani, non va considerato confermato.</p>
      </div>
      ${cards}
    `;
  }

  function selectProduct(id) {
    state.selectedId = id;
    const product = data.products.find((item) => item.id === id);
    renderProducts();
    renderDetail(product);
  }

  function bindEvents() {
    els.categoryList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      state.category = button.dataset.category;
      renderCategories();
      renderProducts();
    });

    els.productList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-product-id]");
      if (!button) return;
      selectProduct(button.dataset.productId);
    });

    els.answerPanel.addEventListener("click", (event) => {
      const button = event.target.closest("[data-product-id]");
      if (!button) return;
      selectProduct(button.dataset.productId);
      document.getElementById("productDetail").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    els.productSearch.addEventListener("input", () => {
      state.query = els.productSearch.value;
      renderProducts();
    });

    els.clearSearch.addEventListener("click", () => {
      state.query = "";
      els.productSearch.value = "";
      renderProducts();
    });

    els.hideDiscontinued.addEventListener("change", () => {
      state.hideDiscontinued = els.hideDiscontinued.checked;
      renderProducts();
    });

    els.askButton.addEventListener("click", answerQuestion);
    els.questionInput.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") answerQuestion();
    });
    els.resetQuestion.addEventListener("click", () => {
      els.questionInput.value = "";
      els.topicSelect.value = "auto";
      answerQuestion();
    });
  }

  function init() {
    els.dataStatus.textContent = `${data.productCount || data.products.length} schede tecniche indicizzate`;
    renderCategories();
    renderProducts();
    bindEvents();
    const first = filteredProducts()[0];
    if (first) selectProduct(first.id);
  }

  init();
})();
