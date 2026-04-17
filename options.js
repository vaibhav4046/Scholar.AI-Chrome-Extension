/* ScholarAI options */

const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  apiKey: "",
  model: "gemini-2.5-flash",
  theme: "dark",
  floatButton: true,
  relatedEnabled: true,
  depth: "standard",
};

document.addEventListener("DOMContentLoaded", async () => {
  const s = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const cfg = { ...DEFAULTS, ...s };

  $("apiKey").value = cfg.apiKey || "";
  $("model").value = cfg.model;
  $("depth").value = cfg.depth;
  setSwitch("themeSwitch", cfg.theme === "dark");
  setSwitch("floatSwitch", !!cfg.floatButton);
  setSwitch("relatedSwitch", !!cfg.relatedEnabled);

  document.documentElement.setAttribute("data-theme", cfg.theme);

  // API key
  $("apiKey").addEventListener("change", async () => {
    await chrome.storage.local.set({ apiKey: $("apiKey").value.trim() });
    toast("API key saved.", "ok");
  });
  $("apiKey").addEventListener("blur", async () => {
    await chrome.storage.local.set({ apiKey: $("apiKey").value.trim() });
  });
  $("toggleKey").addEventListener("click", () => {
    const i = $("apiKey");
    i.type = i.type === "password" ? "text" : "password";
  });
  $("testKey").addEventListener("click", testKey);

  // Model / depth
  $("model").addEventListener("change", async () => {
    await chrome.storage.local.set({ model: $("model").value });
    toast("Model updated.", "ok");
  });
  $("depth").addEventListener("change", async () => {
    await chrome.storage.local.set({ depth: $("depth").value });
    toast("Depth updated.", "ok");
  });

  // Switches
  $("themeSwitch").addEventListener("click", async () => {
    const on = toggleSwitch("themeSwitch");
    const theme = on ? "dark" : "light";
    await chrome.storage.local.set({ theme });
    document.documentElement.setAttribute("data-theme", theme);
  });
  $("floatSwitch").addEventListener("click", async () => {
    const on = toggleSwitch("floatSwitch");
    await chrome.storage.local.set({ floatButton: on });
  });
  $("relatedSwitch").addEventListener("click", async () => {
    const on = toggleSwitch("relatedSwitch");
    await chrome.storage.local.set({ relatedEnabled: on });
  });

  // Data
  $("exportAll").addEventListener("click", exportAll);
  $("importAll").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", importAll);
  $("wipe").addEventListener("click", wipeAll);
  $("resetBtn").addEventListener("click", (e) => { e.preventDefault(); resetDefaults(); });
});

function setSwitch(id, on) {
  const el = $(id);
  el.classList.toggle("on", on);
  el.setAttribute("aria-checked", on ? "true" : "false");
}

function toggleSwitch(id) {
  const el = $(id);
  const on = !el.classList.contains("on");
  el.classList.toggle("on", on);
  el.setAttribute("aria-checked", on ? "true" : "false");
  return on;
}

async function testKey() {
  const key = $("apiKey").value.trim();
  const status = $("keyStatus");
  status.textContent = "";
  if (!key) { status.textContent = "Enter a key first."; status.style.color = "var(--warn)"; return; }
  await chrome.storage.local.set({ apiKey: key });
  status.textContent = "Testing…";
  status.style.color = "var(--text-2)";
  try {
    const resp = await chrome.runtime.sendMessage({ action: "testApiKey" });
    if (resp?.ok) {
      status.textContent = "✓ Key works. You're good to go.";
      status.style.color = "var(--success)";
    } else {
      status.textContent = "✗ " + (resp?.error || "Key rejected.");
      status.style.color = "var(--danger)";
    }
  } catch (e) {
    status.textContent = "✗ " + (e.message || e);
    status.style.color = "var(--danger)";
  }
}

async function exportAll() {
  const data = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scholarai_backup_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Library exported.", "ok");
}

async function importAll(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await chrome.storage.local.set(data);
    toast("Import done. Reloading…", "ok");
    setTimeout(() => location.reload(), 900);
  } catch (err) {
    toast("Invalid JSON.", "err");
  }
}

async function wipeAll() {
  if (!confirm("Delete everything (keys, papers, chats)? Cannot be undone.")) return;
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  toast("Wiped. Reloading…", "ok");
  setTimeout(() => location.reload(), 900);
}

async function resetDefaults() {
  if (!confirm("Reset settings to defaults? (Library kept.)")) return;
  const lib = (await chrome.storage.local.get(["library", "stats"]));
  await chrome.storage.local.clear();
  await chrome.storage.local.set({ ...DEFAULTS, ...lib });
  toast("Defaults restored.", "ok");
  setTimeout(() => location.reload(), 900);
}

function toast(msg, variant) {
  const t = document.createElement("div");
  t.className = "toast" + (variant ? " " + variant : "");
  t.textContent = msg;
  $("toastMount").appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
