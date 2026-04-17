# Contributing to ScholarAI

Thanks for wanting to help. Short guide:

## Getting started

```bash
git clone https://github.com/vaibhav4046/Scholar.AI-Chrome-Extension.git
cd Scholar.AI-Chrome-Extension
```

No build step. No `npm install`. Plain HTML, CSS, JS modules.

Load in Chrome:
1. `chrome://extensions/`
2. Developer mode ON
3. **Load unpacked** → select folder
4. Make changes → hit the refresh icon on the extension card

## Project layout

```
manifest.json      Manifest V3 (permissions, entry points, commands)
background.js     Service worker: Gemini client, URL fetch, citations
content.js        Page extractors + floating button injector
content.css       Floating button / flash toast styles
popup.html/.js    Popup UI (shared logic with side panel)
sidepanel.html    Side panel shell (reuses popup.js)
options.html/.js  Settings page
styles.css        Shared design tokens & components
```

## Patterns to follow

- **Messages, not globals.** popup ↔ background talk only via `chrome.runtime.sendMessage`.
- **Storage split.** `chrome.storage.local` = settings + library (persistent). `chrome.storage.session` = current paper + chat (ephemeral).
- **No hardcoded keys.** Ever. Users bring their own Gemini key.
- **No libraries.** Zero dependencies. Keep it that way unless really needed.
- **Accessible.** Every button has an `aria-label`. Keep it that way.
- **CSP safe.** No `eval`, no inline event handlers, no remote scripts.

## Adding a new paper source

Open `content.js`. Add:
```js
[/yourdomain\.com/, extractYourDomain],
```
to the `extractors` array, then implement `extractYourDomain()` returning
`{ title, text, authors, source }`. Meta tags and citation tags are
already pre-collected in `collectMeta()` as fallback.

## Testing manually

1. Check popup rendering at `chrome-extension://<id>/popup.html`
2. Paper sites to smoke-test:
   - <https://arxiv.org/abs/1706.03762>
   - <https://pubmed.ncbi.nlm.nih.gov/>
   - <https://www.nature.com/articles/s41586-021-03819-2>
3. Try a PDF upload, a URL, and **Analyze current tab** on each.
4. Verify chat continues to work after closing + reopening the popup
   (session storage should preserve state).
5. Export to Markdown and check the citations block.

## Commit style

Conventional Commits, roughly:

- `feat:` new user-facing feature
- `fix:` bug fix
- `refactor:` internal rework, no behavior change
- `docs:` README / comments
- `chore:` tooling, deps

## Questions

Open an issue at <https://github.com/vaibhav4046/Scholar.AI-Chrome-Extension/issues>.
