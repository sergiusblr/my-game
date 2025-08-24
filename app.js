// LifeCompare MVP - Pure JS, no backend
// Features: i18n (ru/en), age input or DOB -> age, Wikidata SPARQL fetch with pagination,
// Wikipedia REST summary with 7-day cache in localStorage, cards grid, skeletons, URL sharing

(function () {
  "use strict";

  // ---------- i18n ----------
  const I18N = {
    ru: {
      title: "Кого я уже пережил",
      subtitle: "Узнайте, каких известных людей вы уже пережили по возрасту.",
      dateOfBirth: "Дата рождения",
      orAge: "Или возраст",
      show: "Показать",
      helper: "Укажите дату рождения или возраст. Возраст имеет приоритет.",
      survivedX: (n) => `Вы пережили ${n} известных людей`,
      loadMore: "Показать ещё",
      licenses: "Данные: Wikidata (CC0), Wikipedia (CC BY-SA 3.0). Изображения: Wikimedia Commons.",
      more: "Подробнее",
      noImageAlt: "Без изображения",
    },
    en: {
      title: "Whom Have I Outlived",
      subtitle: "Discover notable people you have already outlived by age.",
      dateOfBirth: "Date of birth",
      orAge: "Or age",
      show: "Show",
      helper: "Provide date of birth or age. Age has priority.",
      survivedX: (n) => `You have outlived ${n} notable people`,
      loadMore: "Show more",
      licenses: "Data: Wikidata (CC0), Wikipedia (CC BY-SA 3.0). Images: Wikimedia Commons.",
      more: "Read more",
      noImageAlt: "No image",
    },
  };

  // ---------- DOM ----------
  const dom = {
    title: document.getElementById("app-title"),
    subtitle: document.getElementById("app-subtitle"),
    dobLabel: document.getElementById("dob-label"),
    ageLabel: document.getElementById("age-label"),
    helper: document.getElementById("helper-text"),
    counter: document.getElementById("counter"),
    cardsGrid: document.getElementById("cards-grid"),
    loadMore: document.getElementById("load-more"),
    dob: document.getElementById("dob"),
    age: document.getElementById("age"),
    lang: document.getElementById("lang-select"),
    searchBtn: document.getElementById("search-btn"),
    license: document.getElementById("license-text"),
  };

  // ---------- State ----------
  const state = {
    ageYears: null,
    lang: "ru",
    offset: 0,
    limit: 24,
    totalLoaded: 0,
    isLoading: false,
    lastQueryKey: "",
  };

  // ---------- Utils ----------
  function parseQuery() {
    const url = new URL(window.location.href);
    const ageStr = url.searchParams.get("age");
    const lang = url.searchParams.get("lang");
    const result = {};
    if (ageStr != null && ageStr !== "") {
      const n = Number(ageStr);
      if (!Number.isNaN(n) && n >= 0 && n <= 130) result.age = Math.floor(n);
    }
    if (lang === "en" || lang === "ru") result.lang = lang;
    return result;
  }

  function updateTexts() {
    const t = I18N[state.lang];
    dom.title.textContent = t.title;
    dom.subtitle.textContent = t.subtitle;
    dom.dobLabel.textContent = t.dateOfBirth;
    dom.ageLabel.textContent = t.orAge;
    dom.searchBtn.textContent = t.show;
    dom.helper.textContent = t.helper;
    dom.loadMore.textContent = t.loadMore;
    dom.license.textContent = t.licenses;
    updateCounter(0);
  }

  function updateUrl(ageYears) {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", state.lang);
    if (ageYears != null) url.searchParams.set("age", String(ageYears));
    else url.searchParams.delete("age");
    history.replaceState({}, "", url);
  }

  function calcAgeFromDOB(dobStr) {
    try {
      if (!dobStr) return null;
      const dob = new Date(dobStr);
      if (isNaN(dob.getTime())) return null;
      const now = new Date();
      let years = now.getFullYear() - dob.getFullYear();
      const hasHadBirthday =
        now.getMonth() > dob.getMonth() ||
        (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
      if (!hasHadBirthday) years -= 1;
      return years >= 0 && years <= 130 ? years : null;
    } catch (_) { return null; }
  }

  function clearGridWithSkeletons() {
    dom.cardsGrid.setAttribute("aria-busy", "true");
    dom.cardsGrid.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const sk = document.createElement("div");
      sk.className = "card skeleton";
      sk.innerHTML = `
        <div class="thumb shimmer"></div>
        <div class="content">
          <div class="line shimmer w-70"></div>
          <div class="line shimmer w-40"></div>
          <div class="line shimmer w-90"></div>
          <div class="tags shimmer"></div>
        </div>`;
      dom.cardsGrid.appendChild(sk);
    }
  }

  function updateCounter(n) {
    const t = I18N[state.lang];
    dom.counter.textContent = t.survivedX(n);
  }

  // ---------- Data Fetching ----------
  function sparqlQuery(ageYears, limit, offset, lang) {
    // We retrieve human (Q5) with birth and death dates, compute age at death,
    // filter <= user age, and choose labels and sitelinks for lang.
    const serviceLang = lang === "en" ? "en" : "ru";
    const query = `
SELECT ?person ?personLabel ?dob ?dod ?ageAtDeath ?image ?article (GROUP_CONCAT(DISTINCT ?countryLabel; separator=" | ") AS ?countryLabels) (GROUP_CONCAT(DISTINCT ?occLabel; separator=" | ") AS ?occLabels) WHERE {
  ?person wdt:P31 wd:Q5; wdt:P569 ?dob; wdt:P570 ?dod.
  BIND( YEAR(?dod) - YEAR(?dob) - IF( (MONTH(?dod) < MONTH(?dob)) || (MONTH(?dod) = MONTH(?dob) && DAY(?dod) < DAY(?dob)), 1, 0) AS ?ageAtDeath )
  FILTER(?ageAtDeath <= ${ageYears})
  OPTIONAL { ?person wdt:P18 ?image }
  OPTIONAL { ?person wdt:P27 ?country }
  OPTIONAL { ?person wdt:P106 ?occ }
  # Sitelink in chosen language
  OPTIONAL {
    ?article schema:about ?person;
             schema:isPartOf <https://${serviceLang}.wikipedia.org/>.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${serviceLang},en,ru". }
}
GROUP BY ?person ?personLabel ?dob ?dod ?ageAtDeath ?image ?article
ORDER BY DESC(?ageAtDeath)
LIMIT ${limit}
OFFSET ${offset}`;
    return query;
  }

  async function fetchWikidata(ageYears, limit, offset, lang) {
    const endpoint = "https://query.wikidata.org/sparql";
    const url = endpoint + "?format=json&query=" + encodeURIComponent(sparqlQuery(ageYears, limit, offset, lang));
    const res = await fetch(url, {
      headers: {
        "Accept": "application/sparql-results+json"
      },
    });
    if (!res.ok) throw new Error("Wikidata error: " + res.status);
    const data = await res.json();
    const rows = data.results.bindings.map((b) => {
      const get = (k) => (b[k] ? b[k].value : null);
      const person = get("person");
      const qid = person ? person.split("/").pop() : null;
      const label = get("personLabel");
      const dob = get("dob");
      const dod = get("dod");
      const ageAtDeath = Number(get("ageAtDeath"));
      const image = get("image");
      const countryLabels = get("countryLabels");
      const occLabels = get("occLabels");
      const article = get("article");
      return { qid, label, dob, dod, ageAtDeath, image, countryLabels, occLabels, article };
    });
    return rows;
  }

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (obj.expires < Date.now()) { localStorage.removeItem(key); return null; }
      return obj.value;
    } catch (_) { return null; }
  }
  function cacheSet(key, value, ttlMs) {
    try {
      localStorage.setItem(key, JSON.stringify({ value, expires: Date.now() + ttlMs }));
    } catch (_) {}
  }

  async function fetchWikipediaSummary(title, lang) {
    // Wikipedia REST API /page/summary/{title}
    // Cache by lang+title
    const cacheKey = `summary:${lang}:${title}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
    const api = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/` + encodeURIComponent(title);
    const res = await fetch(api, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Wikipedia error: " + res.status);
    const json = await res.json();
    const value = {
      description: json.description || json.extract || "",
      thumbnail: json.thumbnail ? json.thumbnail.source : null,
      url: json.content_urls && json.content_urls.desktop ? json.content_urls.desktop.page : json.extract_html ? json.extract_html : null,
      title: json.title || title,
    };
    cacheSet(cacheKey, value, 7 * 24 * 60 * 60 * 1000);
    return value;
  }

  function formatLifespan(dob, dod, lang) {
    const start = new Date(dob);
    const end = new Date(dod);
    const y1 = start.getFullYear();
    const y2 = end.getFullYear();
    return lang === "ru" ? `${y1}–${y2}` : `${y1}–${y2}`;
  }

  function formatAge(age, lang) {
    if (lang === "ru") return `${age} лет`;
    return `${age} years`;
  }

  function formatExactAge(dobStr, dodStr, lang) {
    const dob = new Date(dobStr);
    const dod = new Date(dodStr);
    if (isNaN(dob) || isNaN(dod)) return "";
    let years = dod.getFullYear() - dob.getFullYear();
    let months = dod.getMonth() - dob.getMonth();
    let days = dod.getDate() - dob.getDate();
    if (days < 0) {
      const prevMonthDays = new Date(dod.getFullYear(), dod.getMonth(), 0).getDate();
      days += prevMonthDays;
      months -= 1;
    }
    if (months < 0) {
      months += 12;
      years -= 1;
    }
    if (lang === "ru") {
      const y = years + " " + pluralRu(years, ["год", "года", "лет"]);
      const m = months + " " + pluralRu(months, ["месяц", "месяца", "месяцев"]);
      const d = days + " " + pluralRu(days, ["день", "дня", "дней"]);
      return `${y} ${m} ${d}`;
    } else {
      const y = years + (years === 1 ? " year" : " years");
      const m = months + (months === 1 ? " month" : " months");
      const d = days + (days === 1 ? " day" : " days");
      return `${y} ${m} ${d}`;
    }
  }

  function pluralRu(n, forms) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
    return forms[2];
  }

  function createCard(person, lang) {
    const t = I18N[lang];
    const card = document.createElement("article");
    card.className = "card";

    const linkHref = person.article || (person.qid ? `https://${lang}.wikipedia.org/wiki/Special:GoToLinkedPage?item=${person.qid}` : "#");

    const thumbUrl = person.summary?.thumbnail || (person.image ?
      `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(person.image.split('/').pop())}?width=600` : null);

    card.innerHTML = `
      <a class="thumb" href="${linkHref}" target="_blank" rel="noopener noreferrer">
        ${thumbUrl ? `<img class="thumb" src="${thumbUrl}" alt="${person.label || t.noImageAlt}" />` : `<div class="thumb" aria-label="${t.noImageAlt}"></div>`}
      </a>
      <div class="content">
        <div class="name">${person.label || ""}</div>
        <div class="lifespan">${formatLifespan(person.dob, person.dod, lang)} · ${formatExactAge(person.dob, person.dod, lang)}</div>
        ${person.summary?.description ? `<div class="desc">${escapeHtml(person.summary.description)}</div>` : ""}
        <div class="tags">${renderTags(person)}</div>
        <div class="actions">
          <a class="link" href="${linkHref}" target="_blank" rel="noopener noreferrer">${t.more}</a>
        </div>
      </div>`;
    return card;
  }

  function renderTags(person) {
    const tags = [];
    if (person.countryLabels) {
      person.countryLabels.split(" | ").forEach((c) => { if (c) tags.push(`<span class=\"tag\">${escapeHtml(c)}</span>`); });
    }
    if (person.occLabels) {
      person.occLabels.split(" | ").forEach((o) => { if (o) tags.push(`<span class=\"tag\">${escapeHtml(o)}</span>`); });
    }
    return tags.join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadBatch(reset = false) {
    if (state.isLoading || state.ageYears == null) return;
    state.isLoading = true;
    dom.loadMore.hidden = true;
    if (reset) {
      state.offset = 0;
      state.totalLoaded = 0;
      clearGridWithSkeletons();
    }
    try {
      const rows = await fetchWikidata(state.ageYears, state.limit, state.offset, state.lang);
      // For each row, fetch summary if we have sitelink title
      const enriched = await Promise.all(rows.map(async (r) => {
        let summary = null;
        try {
          if (r.article) {
            const url = new URL(r.article);
            const title = decodeURIComponent(url.pathname.split("/").pop() || "");
            if (title) summary = await fetchWikipediaSummary(title, state.lang);
          }
        } catch (_) {}
        return { ...r, summary };
      }));

      if (reset) dom.cardsGrid.innerHTML = "";
      dom.cardsGrid.removeAttribute("aria-busy");

      enriched.forEach((p) => dom.cardsGrid.appendChild(createCard(p, state.lang)));

      state.offset += rows.length;
      state.totalLoaded += rows.length;
      updateCounter(state.totalLoaded);
      dom.loadMore.hidden = rows.length < state.limit;
    } catch (err) {
      console.error(err);
      dom.cardsGrid.innerHTML = `<div class="card" style="grid-column: span 12; padding: 16px;">${escapeHtml(String(err))}</div>`;
    } finally {
      state.isLoading = false;
    }
  }

  function onSearch() {
    const ageVal = dom.age.value.trim();
    let ageYears = null;
    if (ageVal !== "" && !Number.isNaN(Number(ageVal))) {
      ageYears = Math.floor(Number(ageVal));
    } else {
      ageYears = calcAgeFromDOB(dom.dob.value);
    }
    if (ageYears == null || ageYears < 0 || ageYears > 130) {
      // soft error: show nothing but keep skeletons
      updateCounter(0);
      dom.loadMore.hidden = true;
      dom.cardsGrid.innerHTML = "";
      return;
    }
    state.ageYears = ageYears;
    updateUrl(ageYears);
    loadBatch(true);
  }

  function initFromUrl() {
    const q = parseQuery();
    if (q.lang) state.lang = q.lang;
    dom.lang.value = state.lang;
    updateTexts();
    if (q.age != null) {
      state.ageYears = q.age;
      dom.age.value = String(q.age);
      loadBatch(true);
    }
  }

  // ---------- Events ----------
  dom.searchBtn.addEventListener("click", onSearch);
  dom.age.addEventListener("keydown", (e) => { if (e.key === "Enter") onSearch(); });
  dom.dob.addEventListener("keydown", (e) => { if (e.key === "Enter") onSearch(); });
  dom.loadMore.addEventListener("click", () => loadBatch(false));
  dom.lang.addEventListener("change", () => {
    state.lang = dom.lang.value === "en" ? "en" : "ru";
    updateTexts();
    updateUrl(state.ageYears);
    if (state.ageYears != null) loadBatch(true);
  });

  // ---------- Start ----------
  initFromUrl();
})();


