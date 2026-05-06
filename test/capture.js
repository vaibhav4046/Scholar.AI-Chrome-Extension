/* Capture clean popup-sized screenshots via puppeteer.
 *
 * Run: node test/capture.js
 *
 * Drives the test harness in headless Chromium at the popup viewport
 * (440x720), populates each pane state, snaps PNGs to docs/screenshots/.
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const OUT = path.join(__dirname, "..", "docs", "screenshots");
const HARNESS = "http://localhost:8767/test/popup-test.html";
const OPTIONS = "http://localhost:8767/options.html";

const POPUP_W = 440;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: POPUP_W, height: 720 },
  });
  const page = await browser.newPage();

  // ---- 1. Home ----
  await page.goto(HARNESS, { waitUntil: "networkidle0" });
  await page.waitForSelector("#urlBtn");
  await page.evaluate(() => {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "analyze"));
    document.querySelectorAll(".pane").forEach(p => p.classList.toggle("active", p.id === "pane-analyze"));
    document.getElementById("analyzeHome").classList.remove("hidden");
    document.getElementById("analyzeResults").classList.add("hidden");
    document.getElementById("analyzeLoading").classList.add("hidden");
    document.getElementById("statPapers").textContent = "12";
    document.getElementById("statChats").textContent = "47";
    document.getElementById("statTime").textContent = "3.8s";
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT, "01-home.png"), type: "png", fullPage: false });
  console.log("✓ 01-home.png");

  // ---- 2. Results ----
  await page.evaluate(() => {
    document.getElementById("analyzeHome").classList.add("hidden");
    document.getElementById("analyzeResults").classList.remove("hidden");
    document.getElementById("resTitle").textContent = "Attention Is All You Need";
    document.getElementById("resMeta").textContent = "arXiv · Vaswani A., Shazeer N., Parmar N. · 2017";
    document.getElementById("resSummary").innerHTML = 'Introduces the Transformer, a sequence-transduction architecture based <strong>entirely on attention mechanisms</strong>, dispensing with recurrence and convolutions. Achieves new SOTA on WMT 2014 En→De / En→Fr.';
    document.getElementById("resFindings").innerHTML = '<ul><li>BLEU 28.4 on WMT 2014 En→De — +2.0 over best prior</li><li>BLEU 41.8 on WMT 2014 En→Fr after 3.5d on 8 GPUs</li><li>8 attention heads enable diverse relations</li></ul>';
    document.getElementById("resMethod").innerHTML = 'Encoder–decoder stack with 6 identical layers each. Self-attention + feed-forward sublayers wrapped with residual connections and layer norm.';
    document.getElementById("resBias").innerHTML = 'Evaluated only on translation; generalization claims not extensively validated.';
    document.getElementById("resGaps").innerHTML = '<ul><li>Scaling to 100B+ parameters</li><li>Post-hoc interpretability of attention</li></ul>';
    document.getElementById("resConf").textContent = "95%";
    document.getElementById("resTime").textContent = "4.2s";
    document.getElementById("resWords").textContent = "8.1k";
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT, "02-results.png"), type: "png", fullPage: true });
  console.log("✓ 02-results.png");

  // ---- 3. Chat ----
  await page.evaluate(() => {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "chat"));
    document.querySelectorAll(".pane").forEach(p => p.classList.toggle("active", p.id === "pane-chat"));
    document.getElementById("chatContext").classList.remove("empty");
    document.getElementById("chatContextLabel").textContent = "Talking to: Attention Is All You Need";
    document.getElementById("chatInput").disabled = false;
    document.getElementById("chatSendBtn").disabled = false;
    document.getElementById("suggestionRow").style.display = "none";
    document.getElementById("chatMsgs").innerHTML = `
      <div class="msg msg-user">What is the main contribution?</div>
      <div class="msg msg-ai">The paper's main contribution is the <strong>Transformer</strong> — replacing recurrence with self-attention. This enables full parallelization and reaches BLEU 28.4 on WMT 2014 En→De.</div>
      <div class="msg msg-user">How does it compare to ConvS2S?</div>
      <div class="msg msg-ai">It surpasses ConvS2S by <strong>+2.0 BLEU</strong> while training in 3.5 days on 8 GPUs. The Transformer is also more parallelizable since each position can be computed independently within a layer.</div>
    `;
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT, "03-chat.png"), type: "png", fullPage: false });
  console.log("✓ 03-chat.png");

  // ---- 4. Library ----
  await page.evaluate(() => {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "library"));
    document.querySelectorAll(".pane").forEach(p => p.classList.toggle("active", p.id === "pane-library"));
    document.getElementById("libraryCount").textContent = "5 papers saved";
    const items = [
      { title: "Attention Is All You Need", source: "arXiv", date: "5/6/2026", conf: 95 },
      { title: "BERT: Pre-training of Deep Bidirectional Transformers", source: "arXiv", date: "5/4/2026", conf: 92 },
      { title: "Language Models are Few-Shot Learners (GPT-3)", source: "arXiv", date: "5/3/2026", conf: 91 },
      { title: "Scaling Laws for Neural Language Models", source: "arXiv", date: "5/2/2026", conf: 88 },
      { title: "Chain-of-Thought Prompting Elicits Reasoning in LLMs", source: "arXiv", date: "5/1/2026", conf: 90 },
    ];
    document.getElementById("libraryList").innerHTML = items.map(it => `
      <div class="library-item">
        <div class="library-item-title">${it.title}</div>
        <div class="library-item-meta">
          <span class="library-item-source">${it.source}</span>
          <span>${it.date}</span>
          <span>${it.conf}%</span>
        </div>
        <div class="library-item-actions">
          <button class="library-item-action">Open</button>
          <button class="library-item-action">Visit source</button>
          <button class="library-item-action">Delete</button>
        </div>
      </div>`).join("");
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT, "04-library.png"), type: "png", fullPage: true });
  console.log("✓ 04-library.png");

  // ---- 5. Options ----
  await page.setViewport({ width: 760, height: 1100 });
  await page.goto(OPTIONS, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT, "05-options.png"), type: "png", fullPage: true });
  console.log("✓ 05-options.png");

  await browser.close();
  console.log("\nAll captures saved to", OUT);
})();
