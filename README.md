# ScholarAI Chrome Extension

## Overview
ScholarAI is an AI-powered Chrome extension for analyzing research papers, articles, and documents. It provides:
- File upload and analysis (PDF, DOC, DOCX, TXT)
- URL-based paper analysis (arXiv, PubMed, etc.)
- One-click analysis of the current web page
- Export, citation, and sharing features
- Confidence score, processing time, and stats tracking

## Production Deployment Tips
- **Restrict Permissions:** In `manifest.json`, limit `host_permissions` and `<all_urls>` to only the domains your extension needs. This improves security and user trust.
- **Test on Target Sites:** Ensure the extension works on all sites you intend to support.
- **Branding:** Update icons and text as needed for your client or organization.
- **Privacy:** Do not collect or transmit user data without consent.

## For Clients
- The extension is fully functional and optimized for performance and security.
- All user actions provide clear feedback and error handling.
- The UI is modern, responsive, and easy to use.

For further customization or support, contact the developer. 

If you want to use this, just upload the files in chrome extension load unpacked section.
