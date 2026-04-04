# Scholar.AI — Chrome Extension

> **AI-powered research paper assistant** — summarize, extract key findings, and have a conversation with any research paper directly in your browser.

[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://javascript.com)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=google-chrome&logoColor=white)](https://chrome.google.com/webstore)
[![OpenAI](https://img.shields.io/badge/OpenAI-API-412991?style=flat-square&logo=openai&logoColor=white)](https://openai.com)

---

## 🎯 What It Solves

Reading academic papers is slow, dense, and time-consuming. Scholar.AI sits in your Chrome toolbar and turns any research paper — whether you're on arXiv, PubMed, or a journal PDF — into an interactive AI session.

---

## ✨ Features

- 📖 **One-click summarization** — get the abstract, methodology, results, and conclusions in plain English
- 🔑 **Key finding extraction** — pulls out the most important claims, metrics, and contributions
- 💬 **Q&A mode** — ask specific questions about the paper ("What dataset did they use?", "What are the limitations?")
- 📋 **Citation generator** — outputs formatted APA/MLA citations instantly
- 🗂️ **Session history** — saves analyzed papers so you can return to previous Q&A sessions
- ⚡ **Works on PDFs and HTML** — detects and processes both PDF viewer pages and HTML paper pages

---

## 🚀 Installation

**Load as unpacked extension (Developer Mode)**

```bash
# 1. Clone the repo
git clone https://github.com/vaibhav4046/Scholar.AI-Chrome-Extension.git

# 2. Open Chrome → chrome://extensions/
# 3. Enable "Developer mode" (top right toggle)
# 4. Click "Load unpacked" → select the cloned folder
# 5. Pin the Scholar.AI extension to your toolbar
```

After loading, click the extension icon → Settings → paste your OpenAI API key. The key is stored locally and never sent to any server other than OpenAI.

---

## 🏗️ Project Structure

```
Scholar.AI-Chrome-Extension/
├── manifest.json           # Extension manifest (V3)
├── background/
│   └── service-worker.js   # Background service worker
├── content/
│   ├── content.js          # Page content extraction
│   └── pdf-parser.js       # PDF text extraction
├── popup/
│   ├── popup.html          # Extension popup UI
│   ├── popup.js            # Main interaction logic
│   └── popup.css           # Styles
├── lib/
│   ├── openai-client.js    # OpenAI API integration
│   └── prompt-templates.js # Structured prompts for each feature
└── icons/
```

---

## 🧠 How It Works

1. **Content extraction:** Clicks on the extension → extracts visible text or parses the PDF
2. **Chunking:** Long papers are split into overlapping chunks to fit within context limits
3. **Prompt routing:** Depending on your action (summarize / extract / Q&A), a structured prompt template is applied
4. **OpenAI API call:** Processed content + prompt is sent to GPT-4
5. **Rendered response:** Results displayed in the extension popup with clean formatting

---

## 🔒 Privacy

- Your OpenAI API key is stored in `chrome.storage.local` — never transmitted to any external server
- Paper content is only sent to OpenAI's API for processing
- No analytics, no tracking, no data collection

---

## 📄 License

MIT

---

<div align="center">
  Made by <a href="https://github.com/vaibhav4046">Vaibhav Lalwani</a> · <a href="https://linkedin.com/in/vaibhav-lalwani">LinkedIn</a>
</div>
