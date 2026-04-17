/* ScholarAI content script — extractors + floating button */

(() => {
  if (window.__SCHOLARAI_INJECTED__) return;
  window.__SCHOLARAI_INJECTED__ = true;

  const ACADEMIC = /arxiv\.org|pubmed|ncbi\.nlm\.nih|biorxiv|medrxiv|nature\.com|science\.org|sciencedirect|ieee\.org|acm\.org|springer|semanticscholar|scholar\.google/i;

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === "extractPageContent") {
      try { sendResponse(extract()); }
      catch (e) { sendResponse({ text: "", title: document.title, error: e.message }); }
      return true;
    }
    if (req.action === "triggerAnalyze") {
      clickFab();
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  // ---------- Extractors ----------

  function extract() {
    const url = location.href;
    const host = location.hostname;
    const baseMeta = collectMeta();

    const extractors = [
      [/arxiv\.org/, extractArxiv],
      [/pubmed|ncbi\.nlm\.nih\.gov/, extractPubMed],
      [/biorxiv|medrxiv/, extractBioRxiv],
      [/nature\.com/, extractNature],
      [/science\.org/, extractScience],
      [/sciencedirect/, extractScienceDirect],
      [/ieeexplore\.ieee\.org/, extractIEEE],
      [/dl\.acm\.org/, extractACM],
      [/link\.springer\.com/, extractSpringer],
      [/semanticscholar\.org/, extractSemanticScholar],
      [/scholar\.google/, extractScholar],
    ];

    for (const [re, fn] of extractors) {
      if (re.test(host)) {
        try {
          const out = fn();
          return mergeResult(out, baseMeta, url);
        } catch (_) {}
      }
    }
    return mergeResult(extractGeneric(), baseMeta, url);
  }

  function collectMeta() {
    const get = (sel) => document.querySelector(sel)?.getAttribute("content") || "";
    return {
      title: get('meta[name="citation_title"]') || get('meta[property="og:title"]'),
      authors: Array.from(document.querySelectorAll('meta[name="citation_author"]'))
        .map((m) => m.content).join(", "),
      year: (get('meta[name="citation_publication_date"]') || get('meta[name="citation_date"]')).match(/\d{4}/)?.[0] || "",
      doi: get('meta[name="citation_doi"]') || "",
      abstract: get('meta[name="citation_abstract"]') || get('meta[name="description"]') || get('meta[property="og:description"]'),
    };
  }

  function mergeResult(ex, meta, url) {
    return {
      title: (ex.title || meta.title || document.title || "Untitled").trim(),
      text: (ex.text || meta.abstract || "").trim(),
      authors: (ex.authors || meta.authors || "").trim(),
      year: ex.year || meta.year || "",
      doi: ex.doi || meta.doi || "",
      source: ex.source || "Web",
      url,
    };
  }

  function extractArxiv() {
    const title = txt(".title") || document.querySelector("h1.title")?.textContent;
    const abstract = txt(".abstract") || txt("blockquote.abstract");
    const authors = Array.from(document.querySelectorAll(".authors a")).map((a) => a.textContent.trim()).join(", ");
    return {
      title: (title || "").replace(/^Title:\s*/i, ""),
      text: (abstract || "").replace(/^Abstract:\s*/i, ""),
      authors,
      source: "arXiv",
    };
  }

  function extractPubMed() {
    const title = txt(".heading-title") || txt("h1");
    const abstract = txt("#abstract") || txt(".abstract-content") || txt("#enc-abstract");
    const authors = Array.from(document.querySelectorAll(".authors-list .full-name, .authors-list a"))
      .map((a) => a.textContent.trim()).join(", ");
    return { title, text: abstract, authors, source: "PubMed" };
  }

  function extractBioRxiv() {
    const title = txt("h1#page-title") || txt("h1.article-title") || txt("h1");
    const abstract = txt(".abstract") || txt("#abstract-1") || txt("section.abstract");
    const authors = Array.from(document.querySelectorAll(".highwire-citation-author, .contrib-group .name"))
      .map((a) => a.textContent.trim()).join(", ");
    return { title, text: abstract, authors, source: /medrxiv/.test(location.href) ? "medRxiv" : "bioRxiv" };
  }

  function extractNature() {
    const title = txt("h1.c-article-title") || txt("h1");
    const abstract = txt("#Abs1-content") || txt(".c-article-section#Abs1") || txt("section[data-title='Abstract']");
    const authors = Array.from(document.querySelectorAll(".c-article-author-list__item, .c-author-list__name"))
      .map((a) => a.textContent.trim()).join(", ");
    return { title, text: abstract, authors, source: "Nature" };
  }

  function extractScience() {
    const title = txt("h1.article__headline, h1.article-header__title, h1");
    const abstract = txt("[role='doc-abstract']") || txt("#abstracts") || txt(".section__abstract");
    const authors = Array.from(document.querySelectorAll(".authors .author-name, meta[name='citation_author']"))
      .map((a) => (a.content || a.textContent).trim()).join(", ");
    return { title, text: abstract, authors, source: "Science" };
  }

  function extractScienceDirect() {
    const title = txt("span.title-text") || txt("h1");
    const abstract = txt("div.abstract.author") || txt("#abstracts") || txt(".abstract");
    const authors = Array.from(document.querySelectorAll(".author-group .author")).map((a) => a.textContent.trim()).join(", ");
    return { title, text: abstract, authors, source: "ScienceDirect" };
  }

  function extractIEEE() {
    const title = txt("h1.document-title span") || txt("h1");
    const abstract = txt(".abstract-text") || txt("div.abstract-text-view");
    const authors = Array.from(document.querySelectorAll(".authors-info .authors__name, .author a")).map((a) => a.textContent.trim()).join(", ");
    return { title, text: abstract, authors, source: "IEEE" };
  }

  function extractACM() {
    const title = txt(".citation__title") || txt("h1");
    const abstract = txt(".abstractSection") || txt("section.abstract");
    const authors = Array.from(document.querySelectorAll(".author-name, .loa__author-name")).map((a) => a.textContent.trim()).join(", ");
    return { title, text: abstract, authors, source: "ACM" };
  }

  function extractSpringer() {
    const title = txt("h1.c-article-title, h1.ChapterTitle, h1");
    const abstract = txt("#Abs1-content, section.Abstract");
    const authors = Array.from(document.querySelectorAll(".c-article-author-list__item")).map((a) => a.textContent.trim()).join(", ");
    return { title, text: abstract, authors, source: "Springer" };
  }

  function extractSemanticScholar() {
    const title = txt("h1[data-test-id='paper-detail-title']") || txt("h1");
    const abstract = txt("[data-test-id='abstract-text']") || txt(".abstract");
    const authors = Array.from(document.querySelectorAll("[data-test-id='author-list'] a, .author-list a"))
      .map((a) => a.textContent.trim()).join(", ");
    return { title, text: abstract, authors, source: "Semantic Scholar" };
  }

  function extractScholar() {
    const title = txt("h3 a");
    const snippet = txt(".gs_rs");
    const authors = txt(".gs_a");
    return { title, text: snippet, authors, source: "Google Scholar" };
  }

  function extractGeneric() {
    // Prefer <article>, <main>, long <p>s
    const article = document.querySelector("article, main, [role=main]");
    let text = "";
    if (article) {
      text = article.innerText;
    } else {
      text = Array.from(document.querySelectorAll("p"))
        .map((p) => p.innerText)
        .filter((t) => t.length > 80)
        .join("\n\n");
      if (!text) text = document.body?.innerText || "";
    }
    return { title: document.title, text: text.slice(0, 120000), source: "Web" };
  }

  function txt(sel) {
    const el = document.querySelector(sel);
    return el ? el.textContent.trim().replace(/\s+/g, " ") : "";
  }

  // ---------- Floating action button ----------

  chrome.storage?.local.get(["floatButton"], (s) => {
    const enabled = s?.floatButton !== false;
    if (enabled && ACADEMIC.test(location.host)) injectFab();
  });

  function injectFab() {
    if (document.getElementById("scholarai-fab")) return;
    const fab = document.createElement("button");
    fab.id = "scholarai-fab";
    fab.title = "Analyze this paper with ScholarAI (Alt+Shift+S)";
    fab.setAttribute("aria-label", "Analyze this paper with ScholarAI");
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        <path d="M8 7h8M8 11h6"/>
      </svg>
      <span>Analyze</span>`;
    fab.addEventListener("click", clickFab);
    document.body.appendChild(fab);
  }

  async function clickFab() {
    const fab = document.getElementById("scholarai-fab");
    if (fab) { fab.classList.add("loading"); fab.querySelector("span").textContent = "Analyzing…"; }
    try {
      const paper = extract();
      if (!paper.text || paper.text.length < 50) {
        showFlash("Not enough text on this page.", "err");
        return;
      }
      const resp = await chrome.runtime.sendMessage({ action: "analyzePaper", paper });
      if (resp?.error) throw new Error(resp.error);
      await chrome.storage.session.set({
        currentPaper: { ...paper, analysis: resp.analysis, confidence: resp.confidence, analyzedAt: Date.now() },
        currentChat: [],
      });
      showFlash("Analysis ready. Open ScholarAI (Alt+S).", "ok");
    } catch (e) {
      showFlash("Error: " + (e.message || e), "err");
    } finally {
      if (fab) { fab.classList.remove("loading"); fab.querySelector("span").textContent = "Analyze"; }
    }
  }

  function showFlash(text, kind) {
    let f = document.getElementById("scholarai-flash");
    if (!f) {
      f = document.createElement("div");
      f.id = "scholarai-flash";
      document.body.appendChild(f);
    }
    f.textContent = text;
    f.className = kind === "err" ? "err" : "ok";
    f.classList.add("show");
    clearTimeout(f._t);
    f._t = setTimeout(() => f.classList.remove("show"), 3200);
  }
})();
