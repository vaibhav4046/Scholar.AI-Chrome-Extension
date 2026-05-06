/* ScholarAI popup — tabbed UI, chat, library, live analysis */

const $ = (id) => document.getElementById(id);

const state = {
  theme: "dark",
  loadedPaper: null,
  chatHistory: [],
  stats: { papers: 0, chats: 0, totalTime: 0 },
  // Mutex for analysis: prevents rapid double-clicks from firing
  // multiple parallel Gemini calls (token waste + UI race).
  analyzing: false,
  // AbortController for the current analysis flow so we can cancel.
  analyzeAbort: null,
};

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await loadStats();
  await loadPinnedPaper();
  await renderLibrary();
  bindEvents();
  autoDetectPaperOnCurrentTab();
});

async function loadSettings() {
  const s = await chrome.storage.local.get(["theme", "apiKey"]);
  state.theme = s.theme || "dark";
  document.documentElement.setAttribute("data-theme", state.theme);
  if (!s.apiKey) {
    showToast("Add your Gemini API key in Settings to start.", "err", 5000);
  }
}

async function loadStats() {
  const s = await chrome.storage.local.get(["stats"]);
  state.stats = s.stats || { papers: 0, chats: 0, totalTime: 0 };
  renderStats();
}

function renderStats() {
  $("statPapers").textContent = state.stats.papers || 0;
  $("statChats").textContent = state.stats.chats || 0;
  const avg = state.stats.papers > 0 ? (state.stats.totalTime / state.stats.papers).toFixed(1) : "0";
  $("statTime").textContent = `${avg}s`;
}

async function loadPinnedPaper() {
  const s = await chrome.storage.session.get(["currentPaper", "currentChat"]);
  if (s.currentPaper) {
    state.loadedPaper = s.currentPaper;
    state.chatHistory = s.currentChat || [];
    renderResults(s.currentPaper);
    updateChatContext();
    renderChat();
  }
}

async function savePinnedPaper() {
  // Strip the PDF base64 before persisting — chrome.storage.session has a
  // 10MB total quota and a single quota-exceeded write throws and leaves
  // state inconsistent. We keep the bytes only in the in-memory state for
  // the current session; chat will fall back to the analysis text.
  const slim = state.loadedPaper
    ? (() => {
        const { pdfBase64, ...rest } = state.loadedPaper;
        // Cap text to ~200KB to stay safely inside the session-storage quota.
        if (rest.text && rest.text.length > 200_000) rest.text = rest.text.slice(0, 200_000);
        return rest;
      })()
    : null;
  try {
    await chrome.storage.session.set({
      currentPaper: slim,
      currentChat: state.chatHistory,
    });
  } catch (e) {
    // If even the slim version is too big, drop the text too.
    try {
      const { text, ...minimal } = slim || {};
      await chrome.storage.session.set({
        currentPaper: minimal,
        currentChat: state.chatHistory,
      });
    } catch (_) { /* swallow — UI state stays in memory */ }
  }
}

async function autoDetectPaperOnCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const academic = /arxiv\.org|pubmed|biorxiv|medrxiv|nature\.com|science\.org|sciencedirect|ieee\.org|springer|acm\.org|semanticscholar/i;
    const isPdfViewer = /\.pdf(\?|$)/i.test(tab.url) || tab.url.startsWith("file://") && /\.pdf$/i.test(tab.url);
    if (isPdfViewer && !state.loadedPaper) {
      const label = $("chatContextLabel");
      if (label) {
        label.textContent = "PDF tab detected. Use the URL field above to analyze it (Chrome blocks scripts inside its PDF viewer).";
      }
      return;
    }
    if (academic.test(tab.url) && !state.loadedPaper) {
      const label = $("chatContextLabel");
      if (label && !state.loadedPaper) {
        label.textContent = "Academic page detected. Click \"Analyze current tab\".";
      }
    }
  } catch (_) {}
}

// ---------- Events ----------
function bindEvents() {
  // Tabs
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => switchTab(t.dataset.tab));
  });

  // Theme
  $("themeBtn").addEventListener("click", toggleTheme);

  // Side panel
  $("expandBtn").addEventListener("click", openSidePanel);

  // Settings
  $("settingsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());

  // Drop zone
  const dz = $("dropZone");
  const fi = $("fileInput");
  dz.addEventListener("click", () => fi.click());
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") fi.click(); });
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragging"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragging"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("dragging");
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fi.addEventListener("change", (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });

  // URL / page
  $("urlBtn").addEventListener("click", handleUrl);
  $("urlInput").addEventListener("keydown", (e) => { if (e.key === "Enter") handleUrl(); });
  $("pageBtn").addEventListener("click", handleCurrentPage);

  // Results actions
  $("backBtn").addEventListener("click", showHome);
  $("chatFromResults").addEventListener("click", () => switchTab("chat"));
  $("copyCiteBtn").addEventListener("click", copyCitation);
  $("exportBtn").addEventListener("click", exportPaper);

  // Chat
  const ci = $("chatInput");
  ci.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  ci.addEventListener("input", () => {
    ci.style.height = "auto";
    ci.style.height = Math.min(ci.scrollHeight, 100) + "px";
  });
  $("chatSendBtn").addEventListener("click", sendChat);
  document.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      ci.value = c.dataset.q;
      sendChat();
    });
  });

  // Library
  $("libraryClearBtn").addEventListener("click", clearLibrary);

  // Cancel during analysis
  const cancelBtn = $("cancelAnalyzeBtn");
  if (cancelBtn) cancelBtn.addEventListener("click", cancelAnalysis);
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.id === `pane-${name}`));
  if (name === "library") renderLibrary();
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", state.theme);
  chrome.storage.local.set({ theme: state.theme });
}

async function openSidePanel() {
  const inSidePanel = document.body.classList.contains("sidepanel");
  if (inSidePanel) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  } catch (e) {
    showToast("Side panel needs Chrome 114+.", "err");
  }
}

// ---------- Analyze guard ----------
function guardAnalyzing() {
  if (state.analyzing) {
    showToast("Analysis already running. Cancel it first.", "err");
    return true;
  }
  return false;
}

// ---------- File upload ----------
async function handleFile(file) {
  if (guardAnalyzing()) return;
  if (file.size > 20 * 1024 * 1024) return showToast("File too big (20MB max).", "err");
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!["pdf", "txt", "doc", "docx"].includes(ext)) {
    return showToast("PDF, TXT, DOC, or DOCX only.", "err");
  }

  startLoading();
  try {
    if (ext === "pdf") {
      const base64 = await fileToBase64(file);
      await runAnalysis({
        title: file.name.replace(/\.pdf$/i, ""),
        source: "Upload",
        url: null,
        pdfBase64: base64,
      });
    } else {
      const text = await file.text();
      await runAnalysis({
        title: file.name.replace(/\.[^.]+$/, ""),
        source: "Upload",
        url: null,
        text,
      });
    }
  } catch (e) {
    stopLoading();
    showToast("Failed: " + (e.message || e), "err");
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ---------- URL ----------
async function handleUrl() {
  if (guardAnalyzing()) return;
  const url = $("urlInput").value.trim();
  if (!url) return showToast("Paste a URL.", "err");
  if (!/^https?:\/\//.test(url)) return showToast("URL must start with http(s)://", "err");

  startLoading();
  try {
    const resp = await chrome.runtime.sendMessage({ action: "fetchUrl", url });
    if (resp?.error) throw new Error(resp.error);
    await runAnalysis({
      title: resp.title || url,
      source: resp.source || "Web",
      url,
      text: resp.text,
      authors: resp.authors,
      year: resp.year,
      doi: resp.doi,
    });
  } catch (e) {
    stopLoading();
    showToast("Fetch failed: " + (e.message || e), "err");
  }
}

// ---------- Current page ----------
async function handleCurrentPage() {
  if (guardAnalyzing()) return;
  startLoading();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab");

    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    } catch (_) { /* already injected */ }

    const resp = await chrome.tabs.sendMessage(tab.id, { action: "extractPageContent" });
    if (!resp?.text) throw new Error("No extractable content on this page.");
    await runAnalysis({
      title: resp.title || tab.title,
      source: resp.source || "Web",
      url: tab.url,
      text: resp.text,
      authors: resp.authors,
      year: resp.year,
      doi: resp.doi,
    });
  } catch (e) {
    stopLoading();
    showToast("Page error: " + (e.message || e), "err");
  }
}

// ---------- Run analysis ----------
async function runAnalysis(paper) {
  state.analyzing = true;
  state.analyzeAbort = { cancelled: false };
  const myAbort = state.analyzeAbort;
  stepLoading("Sending to Gemini…", 40);
  const t0 = performance.now();

  try {
    const resp = await chrome.runtime.sendMessage({ action: "analyzePaper", paper });
    if (myAbort.cancelled) return;
    if (resp?.error) throw new Error(resp.error);

    stepLoading("Finalizing…", 90);
    const took = ((performance.now() - t0) / 1000).toFixed(1);

    const full = {
      ...paper,
      analysis: resp.analysis,
      confidence: resp.confidence,
      analyzedAt: Date.now(),
      processingTime: took,
      wordCount: (paper.text ? paper.text.split(/\s+/).length : resp.analysis.wordCount) || 0,
    };

    state.loadedPaper = full;
    state.chatHistory = [];
    await savePinnedPaper();
    const wasNew = await saveToLibrary(full);
    if (wasNew) bumpStats(parseFloat(took));

    stepLoading("Done", 100);
    setTimeout(() => {
      stopLoading();
      renderResults(full);
      updateChatContext();
      fetchRelated(full);
      // Clear stale URL/file inputs so user knows the slate is fresh.
      const u = $("urlInput"); if (u) u.value = "";
      const fi = $("fileInput"); if (fi) fi.value = "";
    }, 250);
  } catch (e) {
    if (myAbort.cancelled) return;
    stopLoading();
    showToast("Analysis failed: " + (e.message || e), "err");
  } finally {
    state.analyzing = false;
    state.analyzeAbort = null;
  }
}

function cancelAnalysis() {
  if (state.analyzeAbort) state.analyzeAbort.cancelled = true;
  state.analyzing = false;
  stopLoading();
  showHome();
  showToast("Analysis cancelled.", "ok", 1500);
}

async function fetchRelated(paper) {
  try {
    const resp = await chrome.runtime.sendMessage({ action: "findRelated", paper });
    if (resp?.items?.length) renderRelated(resp.items);
  } catch (_) {}
}

// ---------- Rendering ----------
function startLoading() {
  $("analyzeHome").classList.add("hidden");
  $("analyzeResults").classList.add("hidden");
  $("analyzeLoading").classList.remove("hidden");
  stepLoading("Preparing paper…", 15);
}

function stepLoading(text, pct) {
  $("loadingText").textContent = text;
  $("progressFill").style.width = pct + "%";
}

function stopLoading() {
  $("analyzeLoading").classList.add("hidden");
}

function showHome() {
  $("analyzeHome").classList.remove("hidden");
  $("analyzeResults").classList.add("hidden");
  $("analyzeLoading").classList.add("hidden");
}

function renderResults(p) {
  $("analyzeHome").classList.add("hidden");
  $("analyzeResults").classList.remove("hidden");
  $("analyzeLoading").classList.add("hidden");

  const a = p.analysis || {};
  $("resTitle").textContent = p.title || "Untitled";
  const metaParts = [p.source, p.authors, p.year].filter(Boolean);
  $("resMeta").textContent = metaParts.join(" · ") || "";
  $("resSummary").innerHTML = md(a.summary);
  $("resFindings").innerHTML = md(a.findings);
  $("resMethod").innerHTML = md(a.methodology);
  $("resBias").innerHTML = md(a.bias);
  $("resGaps").innerHTML = md(a.gaps);
  $("resConf").textContent = (p.confidence || 0) + "%";
  $("resTime").textContent = (p.processingTime || "—") + "s";
  $("resWords").textContent = p.wordCount ? formatNumber(p.wordCount) : "—";
  $("relatedCard").classList.add("hidden");
  $("relatedList").innerHTML = "";
}

function renderRelated(items) {
  const list = $("relatedList");
  list.innerHTML = "";
  items.slice(0, 5).forEach((it) => {
    const a = document.createElement("a");
    a.href = it.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.style.cssText = "display:block;padding:8px 10px;margin-bottom:4px;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-xs);";
    a.innerHTML = `<div style="font-size:12px;font-weight:600;color:var(--text-0);line-height:1.3;margin-bottom:3px;">${escapeHtml(it.title)}</div>
      <div style="font-size:11px;color:var(--text-3);">${escapeHtml(it.authors || "")} ${it.year ? "· " + it.year : ""}</div>`;
    list.appendChild(a);
  });
  $("relatedCard").classList.remove("hidden");
}

function updateChatContext() {
  const box = $("chatContext");
  const label = $("chatContextLabel");
  const ci = $("chatInput");
  const sb = $("chatSendBtn");
  if (state.loadedPaper) {
    box.classList.remove("empty");
    label.textContent = "Talking to: " + truncate(state.loadedPaper.title, 60);
    ci.disabled = false;
    sb.disabled = false;
  } else {
    box.classList.add("empty");
    label.textContent = "No paper loaded. Analyze one first.";
    ci.disabled = true;
    sb.disabled = true;
  }
}

// ---------- Chat ----------
async function sendChat() {
  const ci = $("chatInput");
  const text = ci.value.trim();
  if (!text || !state.loadedPaper) return;
  ci.value = "";
  ci.style.height = "auto";

  state.chatHistory.push({ role: "user", text });
  renderChat();
  await savePinnedPaper();

  const typingId = addTyping();
  try {
    const resp = await chrome.runtime.sendMessage({
      action: "chatAboutPaper",
      paper: state.loadedPaper,
      history: state.chatHistory,
    });
    removeTyping(typingId);
    if (resp?.error) throw new Error(resp.error);
    state.chatHistory.push({ role: "ai", text: resp.reply });
    renderChat();
    await savePinnedPaper();
    state.stats.chats = (state.stats.chats || 0) + 1;
    chrome.storage.local.set({ stats: state.stats });
    renderStats();
  } catch (e) {
    removeTyping(typingId);
    state.chatHistory.push({ role: "ai", text: "Error: " + (e.message || e) });
    renderChat();
  }
}

function renderChat() {
  const box = $("chatMsgs");
  box.innerHTML = "";
  state.chatHistory.forEach((m) => {
    const d = document.createElement("div");
    d.className = "msg " + (m.role === "user" ? "msg-user" : "msg-ai");
    if (m.role === "ai") d.innerHTML = md(m.text);
    else d.textContent = m.text;
    box.appendChild(d);
  });
  box.scrollTop = box.scrollHeight;
  $("suggestionRow").style.display = state.chatHistory.length ? "none" : "flex";
}

function addTyping() {
  const box = $("chatMsgs");
  const d = document.createElement("div");
  d.className = "msg msg-ai msg-ai-typing";
  d.id = "typing-" + Date.now();
  d.innerHTML = "<span></span><span></span><span></span>";
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  return d.id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ---------- Library ----------
async function saveToLibrary(paper) {
  const s = await chrome.storage.local.get(["library"]);
  const lib = s.library || [];
  const key = paper.url || paper.title;
  const existing = lib.findIndex((x) => (x.url || x.title) === key);
  const entry = {
    id: existing >= 0 ? lib[existing].id : Date.now().toString(36),
    title: paper.title,
    source: paper.source,
    url: paper.url,
    authors: paper.authors,
    year: paper.year,
    doi: paper.doi,
    analysis: paper.analysis,
    confidence: paper.confidence,
    processingTime: paper.processingTime,
    savedAt: Date.now(),
  };
  const isNew = existing < 0;
  if (isNew) lib.unshift(entry);
  else lib[existing] = entry;
  await chrome.storage.local.set({ library: lib.slice(0, 200) });
  return isNew;
}

async function renderLibrary() {
  const s = await chrome.storage.local.get(["library"]);
  const lib = s.library || [];
  $("libraryCount").textContent = `${lib.length} paper${lib.length === 1 ? "" : "s"} saved`;
  const list = $("libraryList");
  list.innerHTML = "";
  if (!lib.length) {
    list.innerHTML = `<div class="library-empty">Nothing saved yet.<br>Analyzed papers land here.</div>`;
    return;
  }
  lib.forEach((item) => {
    const el = document.createElement("div");
    el.className = "library-item";
    el.innerHTML = `
      <div class="library-item-title">${escapeHtml(item.title)}</div>
      <div class="library-item-meta">
        <span class="library-item-source">${escapeHtml(item.source || "Web")}</span>
        <span>${new Date(item.savedAt).toLocaleDateString()}</span>
        ${item.confidence ? `<span>${item.confidence}%</span>` : ""}
      </div>
      <div class="library-item-actions">
        <button class="library-item-action" data-act="open">Open</button>
        ${item.url ? `<button class="library-item-action" data-act="visit">Visit source</button>` : ""}
        <button class="library-item-action" data-act="del">Delete</button>
      </div>`;
    el.querySelectorAll(".library-item-action").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const act = b.dataset.act;
        if (act === "open") loadFromLibrary(item);
        else if (act === "visit" && item.url) chrome.tabs.create({ url: item.url });
        else if (act === "del") deleteFromLibrary(item.id);
      });
    });
    el.addEventListener("click", () => loadFromLibrary(item));
    list.appendChild(el);
  });
}

async function loadFromLibrary(item) {
  state.loadedPaper = item;
  state.chatHistory = [];
  await savePinnedPaper();
  renderResults(item);
  updateChatContext();
  switchTab("analyze");
  // Hint that chat will work off the saved analysis only (no full text).
  if (!item.text && !item.pdfBase64) {
    const ctxLabel = $("chatContextLabel");
    if (ctxLabel) ctxLabel.textContent = "Talking to: " + truncate(item.title, 50) + " (analysis-only)";
  }
}

async function deleteFromLibrary(id) {
  const s = await chrome.storage.local.get(["library"]);
  const lib = (s.library || []).filter((x) => x.id !== id);
  await chrome.storage.local.set({ library: lib });
  renderLibrary();
}

async function clearLibrary() {
  if (!confirm("Delete all saved papers?")) return;
  await chrome.storage.local.set({ library: [] });
  renderLibrary();
}

// ---------- Export / citation ----------
async function copyCitation() {
  const p = state.loadedPaper;
  if (!p) return;
  const resp = await chrome.runtime.sendMessage({ action: "buildCitation", paper: p });
  const cite = resp?.apa || `${p.title} (${new Date().getFullYear()})`;
  await navigator.clipboard.writeText(cite);
  showToast("APA citation copied.", "ok");
}

async function exportPaper() {
  const p = state.loadedPaper;
  if (!p) return;
  const resp = await chrome.runtime.sendMessage({ action: "buildCitation", paper: p });
  const md = `# ${p.title}

**Source:** ${p.source || ""}
${p.url ? "**URL:** " + p.url + "  " : ""}
${p.authors ? "**Authors:** " + p.authors + "  " : ""}
${p.year ? "**Year:** " + p.year + "  " : ""}
${p.doi ? "**DOI:** " + p.doi + "  " : ""}

## Summary
${p.analysis?.summary || ""}

## Key findings
${p.analysis?.findings || ""}

## Methodology
${p.analysis?.methodology || ""}

## Bias & limitations
${p.analysis?.bias || ""}

## Research gaps
${p.analysis?.gaps || ""}

## Citations
**APA:** ${resp?.apa || ""}

**MLA:** ${resp?.mla || ""}

**BibTeX:**
\`\`\`bibtex
${resp?.bibtex || ""}
\`\`\`

---
Analyzed by ScholarAI · ${new Date().toISOString()}
`;
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitize(p.title)}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Exported markdown.", "ok");
}

// ---------- Helpers ----------
function bumpStats(t) {
  state.stats.papers = (state.stats.papers || 0) + 1;
  state.stats.totalTime = (state.stats.totalTime || 0) + (isFinite(t) ? t : 0);
  chrome.storage.local.set({ stats: state.stats });
  renderStats();
}

function md(text) {
  if (!text) return "<em style='color:var(--text-3);'>—</em>";
  let h = escapeHtml(text);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
  h = h.replace(/(<li>.+<\/li>\n?)+/g, (m) => "<ul>" + m + "</ul>");
  h = h.replace(/\n\n/g, "<br><br>");
  h = h.replace(/\n/g, "<br>");
  return h;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function sanitize(s) {
  return String(s).replace(/[^a-z0-9-_ ]/gi, "").slice(0, 80).trim().replace(/\s+/g, "_") || "paper";
}

function truncate(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatNumber(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function showToast(msg, variant, ms) {
  const t = document.createElement("div");
  t.className = "toast" + (variant ? " " + variant : "");
  t.textContent = msg;
  $("toastMount").appendChild(t);
  setTimeout(() => t.remove(), ms || 2800);
}

// Keyboard: Esc → home (or cancel analysis if running)
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (state.analyzing) {
    cancelAnalysis();
    return;
  }
  if (!$("analyzeResults").classList.contains("hidden")) showHome();
});
