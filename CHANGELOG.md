# Changelog

All notable changes to ScholarAI are tracked here.

## [2.0.0] — 2026-04-17

Ground-up rewrite. New UI, new backend, new everything.

### Added
- **Modern glass UI** with dark + light theme toggle
- **Side panel** mode (persistent while reading papers)
- **Chat with the paper** — multi-turn Q&A that remembers context
- **Library** — every analysis auto-saved locally, reopen anytime
- **Related papers** via Semantic Scholar API
- **Citation export** — APA, MLA, and BibTeX with one click
- **Markdown export** — full analysis to `.md`
- **Library export/import** — JSON backup and restore
- **Floating action button** that appears on academic sites
- **Context menu** — analyze page, analyze selection, open side panel
- **Keyboard shortcuts** — Alt+S (open), Alt+Shift+S (analyze current page)
- **Options page** — API key, model selector, analysis depth, toggles
- **Model picker** — Gemini 2.5 Flash / Flash Lite / Pro
- **API key testing** from Settings
- Real structured extractors for arXiv, PubMed, Nature, Science,
  ScienceDirect, IEEE Xplore, ACM, Springer, bioRxiv, medRxiv,
  Semantic Scholar, Google Scholar
- Smart generic extractor prefers `<article>`, `<main>`, citation meta

### Changed
- **Manifest V3** fully compliant with modular service worker
- Gemini 2.5 Flash default (was legacy endpoint)
- PDF handling now uses Gemini's native `inlineData` — actual text
  extraction replaces the old broken `FileReader.readAsText` approach
- URL fetches moved to the background service worker, bypassing CORS
- JSON-schema output from Gemini for deterministic parsing
- Confidence score now based on answer completeness, not faked
- Chat history persisted in session storage, survives popup re-open

### Fixed
- **Security**: removed hardcoded Gemini API key from source (was
  leaking publicly on GitHub). Users now bring their own key.
- PDF uploads that previously produced gibberish now work end-to-end
- CORS errors when fetching paper URLs from the popup
- Placeholder-only extractors for IEEE, Nature, Springer, etc. now
  actually extract structured content
- Accurate progress indicator (was cosmetic animation only)
- Icon PNGs that were 1-byte stubs regenerated as valid 16/48/128
- Error messages surfaced clearly instead of silently failing
- "Citation copied" no longer shown via the error banner

### Security
- API key stored exclusively in `chrome.storage.local` on the user's
  device. Never transmitted to any server except Google's Gemini API.
- No analytics, no telemetry, no third-party server in between.

## [1.0.0] — initial release

- Basic summarization via hardcoded Gemini key
- arXiv, PubMed, Scholar partial support
- Popup UI with gradient theme
