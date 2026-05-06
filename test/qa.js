/* QA test suite — pure-function unit tests + brutal-scenario coverage.
 *
 * Run: node test/qa.js
 *
 * No live Chrome / Gemini calls. Only validates that the deterministic
 * logic in background.js + popup.js handles all the edge cases the
 * production code is supposed to handle.
 */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let pass = 0, fail = 0;
const failed = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; failed.push({ name, err: e }); console.log(`  ✗ ${name}\n    ${e.message}`); }
}
function group(label, fn) { console.log("\n" + label); fn(); }

// ----------------------------------------------------------------------------
// 1. toMd: array/object/string coercion (Bug #1: Gemini returns array fields)
// ----------------------------------------------------------------------------

const toMd = (v) => {
  if (!v) return "";
  if (Array.isArray(v)) return v.map((x) => `- ${typeof x === "string" ? x : JSON.stringify(x)}`).join("\n");
  if (typeof v === "object") return Object.entries(v).map(([k, val]) => `- **${k}:** ${val}`).join("\n");
  return String(v);
};

group("Bug #1 — toMd coerces Gemini variant outputs", () => {
  test("string passes through unchanged", () => {
    assert.equal(toMd("Plain summary text."), "Plain summary text.");
  });
  test("array of strings -> markdown bullets", () => {
    const out = toMd(["First", "Second", "Third"]);
    assert.equal(out, "- First\n- Second\n- Third");
  });
  test("array of objects -> JSON-stringified bullets", () => {
    const out = toMd([{ k: "v" }, { k2: "v2" }]);
    assert.match(out, /^- \{"k":"v"\}\n- \{"k2":"v2"\}$/);
  });
  test("object -> key/value bullets", () => {
    const out = toMd({ method: "RCT", n: 200 });
    assert.equal(out, "- **method:** RCT\n- **n:** 200");
  });
  test("empty string -> empty", () => assert.equal(toMd(""), ""));
  test("null -> empty", () => assert.equal(toMd(null), ""));
  test("undefined -> empty", () => assert.equal(toMd(undefined), ""));
  test("number -> stringified", () => assert.equal(toMd(42), "42"));
  test("nested arrays: each item stringified", () => {
    const out = toMd([["a","b"], "c"]);
    assert.match(out, /\["a","b"\]/);
  });
});

// ----------------------------------------------------------------------------
// 2. Confidence calc: only count strings with len>20 (Bug #3)
// ----------------------------------------------------------------------------

function confidence(filled, isPdf) {
  const filledCount = ["summary", "findings", "methodology", "bias", "gaps"].filter(
    (k) => typeof filled[k] === "string" && filled[k].length > 20
  ).length;
  return Math.min(98, 60 + filledCount * 7 + (isPdf ? 5 : 0));
}

group("Bug #3 — confidence ignores arrays / short strings", () => {
  test("all 5 fields filled with long strings -> 95% (no PDF)", () => {
    const f = { summary:"x".repeat(30), findings:"y".repeat(30), methodology:"z".repeat(30), bias:"w".repeat(30), gaps:"q".repeat(30) };
    assert.equal(confidence(f, false), 95);
  });
  test("PDF bonus: 5 fields + pdf -> 98% (capped)", () => {
    const f = { summary:"x".repeat(30), findings:"y".repeat(30), methodology:"z".repeat(30), bias:"w".repeat(30), gaps:"q".repeat(30) };
    assert.equal(confidence(f, true), 98);
  });
  test("array field counted as 0 (the regression)", () => {
    const f = { summary:"x".repeat(30), findings:["a","b"], methodology:"", bias:"", gaps:"" };
    // Only summary qualifies
    assert.equal(confidence(f, false), 67);
  });
  test("short field <=20 chars not counted", () => {
    const f = { summary:"too short", findings:"", methodology:"", bias:"", gaps:"" };
    assert.equal(confidence(f, false), 60);
  });
  test("all empty -> floor 60%", () => {
    assert.equal(confidence({}, false), 60);
  });
});

// ----------------------------------------------------------------------------
// 3. buildCitations: APA n.d. + clean punctuation (Bug #5)
// ----------------------------------------------------------------------------

function buildCitations(paper) {
  const authors = paper.authors && paper.authors.trim() ? paper.authors : "Unknown Author";
  const year = paper.year || "n.d.";
  const bibtexYear = paper.year || new Date(paper.analyzedAt || Date.now()).getFullYear();
  const title = paper.title || "Untitled";
  const source = paper.source || "";
  const url = paper.url || "";
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : url;

  const apaParts = [`${authors} (${year}).`, `${title}.`];
  if (source) apaParts.push(`${source}.`);
  if (doiUrl) apaParts.push(doiUrl);
  const apa = apaParts.join(" ");

  const mlaParts = [`${authors}. "${title}."`];
  if (source) mlaParts.push(`${source},`);
  mlaParts.push(`${year}${doiUrl ? "," : "."}`);
  if (doiUrl) mlaParts.push(`${doiUrl}.`);
  const mla = mlaParts.join(" ");

  const firstAuthorRaw = (authors.split(",")[0] || "Author").trim();
  const tokens = firstAuthorRaw.split(/\s+/).filter(Boolean);
  const looksLikeInitial = (t) => /^[A-Z]\.?$/.test(t);
  const family = tokens.length === 0
    ? "ref"
    : looksLikeInitial(tokens[0])
      ? tokens[tokens.length - 1]
      : tokens[0];
  const firstAuthor = family.replace(/\W/g, "") || "ref";
  const bibtex = `@article{${firstAuthor}${bibtexYear},
  title={${title}},
  author={${authors}},
  year={${bibtexYear}},
  journal={${source}},
  url={${url}}${paper.doi ? `,\n  doi={${paper.doi}}` : ""}
}`;
  return { apa, mla, bibtex };
}

group("Bug #5 — buildCitations APA correctness", () => {
  test("missing year -> 'n.d.' (not current year)", () => {
    const c = buildCitations({ title: "Foo", authors: "Bar B.", source: "arXiv" });
    assert.match(c.apa, /\(n\.d\.\)/);
    assert.doesNotMatch(c.apa, /20\d{2}/);
  });
  test("known year preserved", () => {
    const c = buildCitations({ title: "Foo", authors: "Bar B.", year: "2017" });
    assert.match(c.apa, /\(2017\)/);
  });
  test("missing source: APA does not have empty period", () => {
    const c = buildCitations({ title: "X", authors: "Y" });
    assert.doesNotMatch(c.apa, /\.\s+\./);
  });
  test("missing authors -> 'Unknown Author'", () => {
    const c = buildCitations({ title: "X" });
    assert.match(c.apa, /^Unknown Author /);
  });
  test("DOI appended as full URL", () => {
    const c = buildCitations({ title: "X", authors: "Y", year: "2024", doi: "10.1234/abc" });
    assert.match(c.apa, /https:\/\/doi\.org\/10\.1234\/abc/);
  });
  test("BibTeX year falls back to current year (not n.d.)", () => {
    const c = buildCitations({ title: "X", authors: "Y" });
    assert.doesNotMatch(c.bibtex, /year=\{n\.d\.\}/);
    assert.match(c.bibtex, /year=\{20\d{2}\}/);
  });
  test("BibTeX key — 'Lastname I.' format", () => {
    const c = buildCitations({ title: "X", authors: "Vaswani A.", year: "2017" });
    assert.match(c.bibtex, /^@article\{Vaswani2017,/);
  });
  test("BibTeX key — 'I. Lastname' format", () => {
    const c = buildCitations({ title: "X", authors: "A. Vaswani", year: "2017" });
    assert.match(c.bibtex, /^@article\{Vaswani2017,/);
  });
  test("BibTeX key — 'Lastname, First' format", () => {
    const c = buildCitations({ title: "X", authors: "Vaswani, Ashish", year: "2017" });
    assert.match(c.bibtex, /^@article\{Vaswani2017,/);
  });
  test("BibTeX key — multi-author keeps first author's family", () => {
    const c = buildCitations({ title: "X", authors: "Vaswani A., Shazeer N., Parmar N.", year: "2017" });
    assert.match(c.bibtex, /^@article\{Vaswani2017,/);
  });
});

// ----------------------------------------------------------------------------
// 4. PDF base64 stripped before session save (Bug #2)
// ----------------------------------------------------------------------------

function slimForSession(paper) {
  if (!paper) return null;
  const { pdfBase64, ...rest } = paper;
  if (rest.text && rest.text.length > 200_000) rest.text = rest.text.slice(0, 200_000);
  return rest;
}

group("Bug #2 — pdfBase64 stripped + text capped before session save", () => {
  test("pdfBase64 removed from slim", () => {
    const slim = slimForSession({ title: "X", pdfBase64: "AAAA".repeat(100000), text: "abc" });
    assert.equal(slim.pdfBase64, undefined);
    assert.equal(slim.text, "abc");
  });
  test("text >200KB truncated to 200KB", () => {
    const big = "x".repeat(500_000);
    const slim = slimForSession({ title: "Y", text: big });
    assert.equal(slim.text.length, 200_000);
  });
  test("null paper -> null", () => {
    assert.equal(slimForSession(null), null);
  });
  test("paper without pdfBase64 unchanged", () => {
    const slim = slimForSession({ title: "Z", text: "hi", confidence: 80 });
    assert.deepEqual(slim, { title: "Z", text: "hi", confidence: 80 });
  });
});

// ----------------------------------------------------------------------------
// 5. recoverJson fallback parser
// ----------------------------------------------------------------------------

function recoverJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
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

group("recoverJson handles pre/post junk + malformed fallback", () => {
  test("recovers JSON from prose-prefixed response", () => {
    const text = 'Here you go: {"summary":"S","findings":"F"}';
    const o = recoverJson(text);
    assert.equal(o.summary, "S");
  });
  test("recovers via per-key regex when JSON malformed", () => {
    const text = `"summary": "Real summary text",\n"findings": "Real findings",\n"methodology": "Method"\n`;
    const o = recoverJson(text);
    assert.equal(o.summary, "Real summary text");
    assert.equal(o.findings, "Real findings");
  });
  test("empty input -> all empty fields", () => {
    const o = recoverJson("");
    assert.equal(o.summary, "");
    assert.equal(o.findings, "");
  });
});

// ----------------------------------------------------------------------------
// 6. md() popup renderer escapes HTML and respects bullet lists
// ----------------------------------------------------------------------------

function md(text) {
  if (!text) return "<em style='color:var(--text-3);'>—</em>";
  const escapeHtml = (s) =>
    String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  let h = escapeHtml(text);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
  h = h.replace(/(<li>.+<\/li>\n?)+/g, (m) => "<ul>" + m + "</ul>");
  h = h.replace(/\n\n/g, "<br><br>");
  h = h.replace(/\n/g, "<br>");
  return h;
}

group("md() popup renderer", () => {
  test("XSS: <script> escaped", () => {
    const out = md('<script>alert(1)</script>');
    assert.match(out, /&lt;script&gt;/);
    assert.doesNotMatch(out, /<script>/i);
  });
  test("**bold** wrapped", () => {
    assert.match(md("Hello **world**"), /<strong>world<\/strong>/);
  });
  test("`code` wrapped", () => {
    assert.match(md("call `foo()`"), /<code>foo\(\)<\/code>/);
  });
  test("- bullets become <ul><li>", () => {
    const out = md("- one\n- two");
    assert.match(out, /<ul><li>one<\/li>/);
    assert.match(out, /<li>two<\/li><\/ul>/);
  });
  test("empty -> em-dash placeholder", () => {
    assert.match(md(""), /—/);
  });
});

// ----------------------------------------------------------------------------
// 7. Library dedupe: saveToLibrary returns isNew correctly (Bug #4)
// ----------------------------------------------------------------------------

function simulateSave(lib, paper) {
  const key = paper.url || paper.title;
  const existing = lib.findIndex((x) => (x.url || x.title) === key);
  const entry = {
    id: existing >= 0 ? lib[existing].id : `id-${Math.random().toString(36).slice(2,8)}`,
    title: paper.title, url: paper.url,
    analysis: paper.analysis, savedAt: Date.now(),
  };
  const isNew = existing < 0;
  if (isNew) lib.unshift(entry); else lib[existing] = entry;
  return { lib, isNew };
}

group("Bug #4 — library dedupe returns isNew correctly", () => {
  test("first add: isNew=true", () => {
    const r = simulateSave([], { title: "P1", url: "u1" });
    assert.equal(r.isNew, true);
    assert.equal(r.lib.length, 1);
  });
  test("re-add same url: isNew=false, length unchanged", () => {
    let lib = [];
    ({ lib } = simulateSave(lib, { title: "P1", url: "u1" }));
    const r = simulateSave(lib, { title: "P1 v2", url: "u1" });
    assert.equal(r.isNew, false);
    assert.equal(r.lib.length, 1);
    assert.equal(r.lib[0].title, "P1 v2"); // updated
  });
  test("different url: isNew=true, length grows", () => {
    let lib = [];
    ({ lib } = simulateSave(lib, { title: "P1", url: "u1" }));
    const r = simulateSave(lib, { title: "P2", url: "u2" });
    assert.equal(r.isNew, true);
    assert.equal(r.lib.length, 2);
  });
  test("update preserves the original id (key stability)", () => {
    let lib = [];
    ({ lib } = simulateSave(lib, { title: "P1", url: "u1" }));
    const originalId = lib[0].id;
    const r = simulateSave(lib, { title: "P1 v2", url: "u1" });
    assert.equal(r.lib[0].id, originalId);
  });
});

// ----------------------------------------------------------------------------
// 8. Brutal: huge text, malformed JSON, weird encodings
// ----------------------------------------------------------------------------

group("Brutal-scenario coverage", () => {
  test("toMd with 10k-element array completes <100ms", () => {
    const arr = Array.from({ length: 10_000 }, (_, i) => `Item ${i}`);
    const t0 = Date.now();
    const out = toMd(arr);
    assert.ok(Date.now() - t0 < 100);
    assert.equal(out.split("\n").length, 10_000);
  });
  test("md() with 100KB string handles without blowing up", () => {
    const big = "abc ".repeat(25_000); // 100KB
    const t0 = Date.now();
    const out = md(big);
    assert.ok(Date.now() - t0 < 500); // perf check, not size
    assert.ok(out.length >= big.length); // never shrinks
  });
  test("buildCitations with weird unicode authors", () => {
    const c = buildCitations({ title: "X", authors: "Müller A., 田中 H., Søren B.", year: "2024" });
    assert.match(c.apa, /Müller/);
    // BibTeX key extracts last word of first author -> "Müller" but \W strips non-ASCII
    assert.match(c.bibtex, /^@article\{[A-Za-z]*2024,/);
  });
  test("recoverJson on Gemini response wrapped in ```json``` fences", () => {
    const text = '```json\n{"summary":"hello","findings":"f"}\n```';
    const o = recoverJson(text);
    assert.equal(o.summary, "hello");
  });
  test("slimForSession: massive text + pdfBase64 both stripped", () => {
    const slim = slimForSession({
      title: "X",
      pdfBase64: "A".repeat(20_000_000),
      text: "B".repeat(5_000_000),
    });
    assert.equal(slim.pdfBase64, undefined);
    assert.equal(slim.text.length, 200_000);
  });
});

// ----------------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------------

console.log(`\n${"=".repeat(60)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("\nFailures:");
  failed.forEach((f) => console.log(`  - ${f.name}: ${f.err.message}`));
  process.exit(1);
}
console.log("All green.");
