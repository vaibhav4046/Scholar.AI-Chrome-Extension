/* ScholarAI background service worker (module) */

const DEFAULTS = {
  apiKey: "",
  model: "gemini-2.5-flash",
  depth: "standard",
  relatedEnabled: true,
};

const DEPTH_LIMITS = { quick: 3000, standard: 8000, deep: 60000 };

// -------- Install: context menu + side panel behavior --------

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: "analyzePage",
      title: "ScholarAI: Analyze this page",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: "analyzeSelection",
      title: "ScholarAI: Analyze selected text",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "openSidePanel",
      title: "ScholarAI: Open side panel",
      contexts: ["page"],
    });
  } catch (e) {
    console.error("Context menu error:", e);
  }

  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (_) { /* older chrome */ }

  const s = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const patch = {};
  for (const k of Object.keys(DEFAULTS)) if (s[k] === undefined) patch[k] = DEFAULTS[k];
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
});

// -------- Keyboard command --------

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === "analyze-current-page") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try { await chrome.sidePanel.open({ tabId: tab.id }); } catch (_) {}
    try { await chrome.tabs.sendMessage(tab.id, { action: "triggerAnalyze" }); } catch (_) {}
  }
});

// -------- Context menu clicks --------

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === "openSidePanel" && tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      return;
    }

    if (info.menuItemId === "analyzePage" && tab?.id) {
      await ensureContentScript(tab.id);
      const resp = await chrome.tabs.sendMessage(tab.id, { action: "extractPageContent" });
      if (!resp?.text) {
        notify("No extractable content on this page.");
        return;
      }
      const paper = {
        title: resp.title,
        source: resp.source,
        url: tab.url,
        text: resp.text,
        authors: resp.authors,
        year: resp.year,
        doi: resp.doi,
      };
      const result = await analyzePaper(paper);
      await chrome.storage.session.set({
        currentPaper: { ...paper, analysis: result.analysis, confidence: result.confidence, analyzedAt: Date.now() },
        currentChat: [],
      });
      notify(`Analyzed: ${truncate(paper.title, 60)}`);
      try { await chrome.sidePanel.open({ tabId: tab.id }); } catch (_) {}
    }

    if (info.menuItemId === "analyzeSelection" && info.selectionText && tab?.id) {
      const paper = {
        title: "Selection from " + (tab.title || "page"),
        source: "Selection",
        url: tab.url,
        text: info.selectionText,
      };
      const result = await analyzePaper(paper);
      await chrome.storage.session.set({
        currentPaper: { ...paper, analysis: result.analysis, confidence: result.confidence, analyzedAt: Date.now() },
        currentChat: [],
      });
      notify("Analyzed selection.");
      try { await chrome.sidePanel.open({ tabId: tab.id }); } catch (_) {}
    }
  } catch (e) {
    notify("Error: " + (e.message || e));
  }
});

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (_) {}
}

function notify(message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "ScholarAI",
      message,
    });
  } catch (_) {}
}

// -------- Message router --------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.action === "fetchUrl")           return sendResponse(await handleFetchUrl(msg.url));
      if (msg.action === "analyzePaper")       return sendResponse(await handleAnalyze(msg.paper));
      if (msg.action === "chatAboutPaper")     return sendResponse(await handleChat(msg.paper, msg.history));
      if (msg.action === "findRelated")        return sendResponse(await handleRelated(msg.paper));
      if (msg.action === "buildCitation")      return sendResponse(buildCitations(msg.paper));
      if (msg.action === "testApiKey")         return sendResponse(await handleTestKey());
      if (msg.action === "triggerFloat")       return sendResponse({ ok: true });
      sendResponse({ error: "unknown action" });
    } catch (e) {
      sendResponse({ error: e.message || String(e) });
    }
  })();
  return true; // async
});

// -------- Gemini --------

async function getApiKey() {
  const s = await chrome.storage.local.get(["apiKey"]);
  if (!s.apiKey) throw new Error("No API key. Open Settings and add your Gemini key.");
  return s.apiKey;
}

async function getModel() {
  const s = await chrome.storage.local.get(["model"]);
  return s.model || DEFAULTS.model;
}

async function getDepth() {
  const s = await chrome.storage.local.get(["depth"]);
  return DEPTH_LIMITS[s.depth] || DEPTH_LIMITS.standard;
}

async function geminiCall(parts, { system, responseMime = null, timeoutMs = 90_000 } = {}) {
  const apiKey = await getApiKey();
  const model = await getModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.3,
      topP: 0.95,
      maxOutputTokens: 4096,
      ...(responseMime ? { responseMimeType: responseMime } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") {
      throw new Error(`Gemini request timed out after ${Math.round(timeoutMs / 1000)}s. Try Quick depth or a shorter paper.`);
    }
    throw new Error("Network error calling Gemini: " + (e.message || e));
  }
  clearTimeout(timer);

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(friendlyApiError(resp.status, errText));
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text) {
    const finish = data?.candidates?.[0]?.finishReason;
    if (finish === "SAFETY") throw new Error("Gemini refused to answer (safety filter).");
    if (finish === "MAX_TOKENS") throw new Error("Response cut off. Try Quick depth or shorter paper.");
    throw new Error("Empty response from Gemini.");
  }
  return text;
}

function friendlyApiError(status, body) {
  if (status === 400) return "Bad request: " + (body.slice(0, 180) || "check your key and model");
  if (status === 401 || status === 403) return "API key invalid or unauthorized.";
  if (status === 404) return "Model not available for your key.";
  if (status === 429) return "Rate limit / quota exceeded. Wait a minute and retry.";
  if (status >= 500) return "Gemini service error. Retry shortly.";
  return `API error ${status}`;
}

// -------- URL fetcher (background = no CORS) --------

async function handleFetchUrl(url) {
  try {
    // Use a realistic UA — some publishers (arxiv, nature) reject bot UAs.
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/pdf")) {
      const buf = await r.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      return { title: inferTitleFromUrl(url), source: sourceFromUrl(url), url, pdfBase64: base64, isPdf: true };
    }
    const html = await r.text();
    return parseHtmlForPaper(html, url);
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

function parseHtmlForPaper(html, url) {
  const getMeta = (name) => {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
    const m = html.match(re);
    return m ? decodeHtml(m[1]) : "";
  };

  let title = getMeta("citation_title") || getMeta("og:title") || getMeta("twitter:title");
  if (!title) {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    title = m ? decodeHtml(m[1]).trim() : inferTitleFromUrl(url);
  }

  let authors = "";
  const authorMatches = Array.from(html.matchAll(/<meta[^>]+name=["']citation_author["'][^>]+content=["']([^"']+)["']/gi));
  if (authorMatches.length) authors = authorMatches.map((m) => decodeHtml(m[1])).join(", ");

  const year = (getMeta("citation_publication_date") || getMeta("citation_date") || "").match(/\d{4}/)?.[0] || "";
  const doi = getMeta("citation_doi") || (html.match(/\b10\.\d{4,9}\/[^\s"<>&]+/)?.[0] || "");
  const abstract = getMeta("citation_abstract") || getMeta("og:description") || getMeta("description");

  // Body text — strip scripts/styles, collapse
  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const text = [abstract, body].filter(Boolean).join("\n\n");
  return {
    title: title || "Untitled",
    text: text.slice(0, 120000),
    authors,
    year,
    doi,
    source: sourceFromUrl(url),
    url,
  };
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

function sourceFromUrl(url) {
  const u = url.toLowerCase();
  if (u.includes("arxiv.org")) return "arXiv";
  if (u.includes("biorxiv.org")) return "bioRxiv";
  if (u.includes("medrxiv.org")) return "medRxiv";
  if (u.includes("pubmed") || u.includes("ncbi.nlm.nih.gov")) return "PubMed";
  if (u.includes("nature.com")) return "Nature";
  if (u.includes("science.org")) return "Science";
  if (u.includes("sciencedirect")) return "ScienceDirect";
  if (u.includes("ieee.org")) return "IEEE";
  if (u.includes("acm.org")) return "ACM";
  if (u.includes("springer")) return "Springer";
  if (u.includes("scholar.google")) return "Google Scholar";
  if (u.includes("semanticscholar")) return "Semantic Scholar";
  return "Web";
}

function inferTitleFromUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") || u.hostname;
  } catch {
    return url;
  }
}

// -------- Paper analysis --------

async function handleAnalyze(paper) {
  const result = await analyzePaper(paper);
  return result;
}

async function analyzePaper(paper) {
  const system = `You are an expert academic peer reviewer. Analyze the provided research paper strictly and output valid JSON only.
Fields (all strings; use Markdown inside each):
- "summary": 2-4 sentences. What the paper shows, plain language.
- "findings": 3-6 bullet points. Concrete, numerical where possible.
- "methodology": 2-4 sentences describing methods, datasets, sample size.
- "bias": 2-4 sentences listing concrete limitations or potential biases (be specific, not generic).
- "gaps": 3-5 bullet points of unexplored directions or open questions.
- "wordCount": integer estimate of words in the paper.

Be honest. If the text is too short or off-topic for a paper, say so plainly. Do not hallucinate statistics that aren't in the text.`;

  const depthLimit = await getDepth();
  let parts;
  if (paper.pdfBase64) {
    parts = [
      { inlineData: { mimeType: "application/pdf", data: paper.pdfBase64 } },
      { text: `Title hint: ${paper.title || "Unknown"}\nAnalyze this PDF following the JSON schema.` },
    ];
  } else {
    const text = (paper.text || "").slice(0, depthLimit * 7); // approx words→chars
    if (!text.trim()) throw new Error("No text to analyze.");
    parts = [
      { text: `Title: ${paper.title || "Unknown"}\nSource: ${paper.source || "Web"}\n${paper.authors ? "Authors: " + paper.authors + "\n" : ""}\n---\n${text}` },
    ];
  }

  const raw = await geminiCall(parts, { system, responseMime: "application/json" });
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = recoverJson(raw);
  }

  // Coerce any array fields into markdown bullet lists — Gemini sometimes
  // emits arrays for "findings"/"gaps" even though the schema says string.
  const toMd = (v) => {
    if (!v) return "";
    if (Array.isArray(v)) return v.map((x) => `- ${typeof x === "string" ? x : JSON.stringify(x)}`).join("\n");
    if (typeof v === "object") {
      // Object with key/value pairs → bullet list
      return Object.entries(v).map(([k, val]) => `- **${k}:** ${val}`).join("\n");
    }
    return String(v);
  };

  const filled = {
    summary: toMd(parsed.summary),
    findings: toMd(parsed.findings),
    methodology: toMd(parsed.methodology),
    bias: toMd(parsed.bias),
    gaps: toMd(parsed.gaps),
    wordCount: parsed.wordCount || 0,
  };

  const filledCount = ["summary", "findings", "methodology", "bias", "gaps"].filter(
    (k) => typeof filled[k] === "string" && filled[k].length > 20
  ).length;
  const confidence = Math.min(98, 60 + filledCount * 7 + (paper.pdfBase64 ? 5 : 0));

  return { analysis: filled, confidence };
}

function recoverJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  // fallback: loose field parsing
  const grab = (key) => {
    const re = new RegExp(`"?${key}"?\\s*:\\s*"([\\s\\S]*?)"(?=,\\s*"|\\s*\\})`, "i");
    return (text.match(re) || [])[1] || "";
  };
  return {
    summary: grab("summary"),
    findings: grab("findings"),
    methodology: grab("methodology"),
    bias: grab("bias"),
    gaps: grab("gaps"),
  };
}

// -------- Chat --------

async function handleChat(paper, history) {
  if (!paper) throw new Error("No paper loaded.");
  if (!history || !history.length) throw new Error("No question to answer.");

  const system = `You are ScholarAI, helping a user understand a specific research paper. You may only reason about the paper below. If asked something not answerable from the paper, say so and suggest what to look up.
Paper title: ${paper.title || "Unknown"}
Source: ${paper.source || "Web"}
${paper.authors ? "Authors: " + paper.authors : ""}

Answer concisely (under 150 words) with Markdown. Cite short quotes when precise. Never invent numbers.`;

  const depthLimit = await getDepth();
  const fallbackText = paper.text || paper.analysis?.summary || "";
  const contextText = fallbackText.slice(0, Math.min(depthLimit * 7, 40000));

  // If we have neither text nor pdfBase64 nor any analysis, refuse early
  // so the user gets a useful error instead of a hallucinated answer.
  if (!contextText && !paper.pdfBase64 && !paper.analysis) {
    throw new Error(
      "No paper context available. Re-analyze the paper from a URL or PDF before chatting."
    );
  }

  const contextSummary = paper.analysis
    ? `Prior analysis:\nSummary: ${paper.analysis.summary || "—"}\nMethodology: ${paper.analysis.methodology || "—"}\nFindings: ${paper.analysis.findings || "—"}\nLimitations: ${paper.analysis.bias || "—"}\n\n`
    : "";

  const conversation = history
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n\n");

  const parts = [];
  if (paper.pdfBase64) {
    parts.push({ inlineData: { mimeType: "application/pdf", data: paper.pdfBase64 } });
  }
  parts.push({
    text: `${contextSummary}${
      contextText ? "Paper text (excerpt):\n" + contextText + "\n\n" : ""
    }---\nConversation so far:\n${conversation}\n\nAssistant:`,
  });

  const reply = await geminiCall(parts, { system });
  return { reply };
}

// -------- Related papers (Semantic Scholar) --------

async function handleRelated(paper) {
  const s = await chrome.storage.local.get(["relatedEnabled"]);
  if (s.relatedEnabled === false) return { items: [] };
  try {
    const q = encodeURIComponent((paper.title || "").slice(0, 180));
    if (!q) return { items: [] };
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=8&fields=title,authors,year,url,externalIds`;
    const r = await fetch(url);
    if (!r.ok) return { items: [] };
    const data = await r.json();
    const items = (data.data || [])
      .filter((p) => (p.title || "").toLowerCase() !== (paper.title || "").toLowerCase())
      .slice(0, 5)
      .map((p) => ({
        title: p.title,
        authors: (p.authors || []).slice(0, 3).map((a) => a.name).join(", "),
        year: p.year,
        url: p.url || (p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : ""),
      }));
    return { items };
  } catch {
    return { items: [] };
  }
}

// -------- Citations --------

function buildCitations(paper) {
  const authors = paper.authors && paper.authors.trim() ? paper.authors : "Unknown Author";
  // Per APA: use "n.d." (no date) when the year is genuinely unknown.
  const year = paper.year || "n.d.";
  const bibtexYear = paper.year || new Date(paper.analyzedAt || Date.now()).getFullYear();
  const title = paper.title || "Untitled";
  const source = paper.source || "";
  const url = paper.url || "";
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : url;

  // Build APA cleanly without trailing periods on missing fields.
  const apaParts = [`${authors} (${year}).`, `${title}.`];
  if (source) apaParts.push(`${source}.`);
  if (doiUrl) apaParts.push(doiUrl);
  const apa = apaParts.join(" ");

  const mlaParts = [`${authors}. "${title}."`];
  if (source) mlaParts.push(`${source},`);
  mlaParts.push(`${year}${doiUrl ? "," : "."}`);
  if (doiUrl) mlaParts.push(`${doiUrl}.`);
  const mla = mlaParts.join(" ");

  const firstAuthor =
    (authors.split(",")[0] || "Author").split(" ").slice(-1)[0].replace(/\W/g, "") || "ref";
  const bibtex = `@article{${firstAuthor}${bibtexYear},
  title={${title}},
  author={${authors}},
  year={${bibtexYear}},
  journal={${source}},
  url={${url}}${paper.doi ? `,\n  doi={${paper.doi}}` : ""}
}`;
  return { apa, mla, bibtex };
}

// -------- Test key --------

async function handleTestKey() {
  try {
    await geminiCall([{ text: 'Reply with the single word: ok' }]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// -------- Utils --------

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function truncate(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
