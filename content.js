// ScholarAI Content Script - Extracts content from academic pages
class ContentExtractor {
    constructor() {
        this.setupMessageListener();
        this.detectAcademicContent();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "extractPageContent") {
                let content;
                try {
                    content = this.extractPageContent();
                } catch (err) {
                    console.error('ScholarAI extraction error:', err);
                    content = this.safeFallbackContent();
                }
                sendResponse(content);
            }
            return true;
        });
    }

    extractPageContent() {
        try {
            const url = window.location.href;
            let content = {
                title: document.title,
                text: '',
                url: url,
                type: 'unknown'
            };

            // Detect paper type and extract accordingly
            if (url.includes('arxiv.org')) {
                content = this.safeExtract(() => this.extractArxivPaper(), content);
            } else if (url.includes('pubmed.ncbi.nlm.nih.gov')) {
                content = this.safeExtract(() => this.extractPubMedPaper(), content);
            } else if (url.includes('scholar.google.com')) {
                content = this.safeExtract(() => this.extractGoogleScholar(), content);
            } else if (url.includes('researchgate.net')) {
                content = this.safeExtract(() => this.extractResearchGate(), content);
            } else if (url.includes('ieee.org')) {
                content = this.safeExtract(() => this.extractIEEE(), content);
            } else if (url.includes('acm.org')) {
                content = this.safeExtract(() => this.extractACM(), content);
            } else if (url.includes('springer.com')) {
                content = this.safeExtract(() => this.extractSpringer(), content);
            } else if (url.includes('nature.com')) {
                content = this.safeExtract(() => this.extractNature(), content);
            } else if (url.includes('sciencedirect.com')) {
                content = this.safeExtract(() => this.extractScienceDirect(), content);
            } else {
                content = this.safeExtract(() => this.extractGenericContent(), content);
            }
            return content;
        } catch (err) {
            console.error('ScholarAI extractPageContent error:', err);
            return this.safeFallbackContent();
        }
    }

    safeExtract(fn, fallback) {
        try {
            return fn();
        } catch (err) {
            console.error('ScholarAI extraction method error:', err);
            return fallback;
        }
    }

    safeFallbackContent() {
        return {
            title: document.title || 'Untitled',
            text: '',
            url: window.location.href,
            type: 'generic',
            source: 'Web Page'
        };
    }

    extractArxivPaper() {
        try {
            const title = document.querySelector('h1.title')?.textContent?.replace('Title:', '').trim() || document.title;
            const abstract = document.querySelector('.abstract')?.textContent || '';
            const authors = Array.from(document.querySelectorAll('.authors a')).map(a => a.textContent).join(', ');
            return {
                title: title,
                text: abstract,
                authors: authors,
                url: window.location.href,
                type: 'arxiv',
                source: 'arXiv'
            };
        } catch (err) {
            console.error('ScholarAI extractArxivPaper error:', err);
            return this.safeFallbackContent();
        }
    }

    extractPubMedPaper() {
        try {
            const title = document.querySelector('h1.heading-title')?.textContent?.trim() || document.title;
            const abstract = document.querySelector('#enc-abstract')?.textContent || 
                            document.querySelector('.abstract-content')?.textContent || '';
            const authors = Array.from(document.querySelectorAll('.authors-list a')).map(a => a.textContent).join(', ');
            return {
                title: title,
                text: abstract,
                authors: authors,
                url: window.location.href,
                type: 'pubmed',
                source: 'PubMed'
            };
        } catch (err) {
            console.error('ScholarAI extractPubMedPaper error:', err);
            return this.safeFallbackContent();
        }
    }

    extractGoogleScholar() {
        try {
            const title = document.querySelector('h3 a')?.textContent?.trim() || document.title;
            const snippet = document.querySelector('.gs_rs')?.textContent || '';
            const authors = document.querySelector('.gs_a')?.textContent || '';
            return {
                title: title,
                text: snippet,
                authors: authors,
                url: window.location.href,
                type: 'scholar',
                source: 'Google Scholar'
            };
        } catch (err) {
            console.error('ScholarAI extractGoogleScholar error:', err);
            return this.safeFallbackContent();
        }
    }

    extractResearchGate() {
        try {
            // Placeholder for ResearchGate extraction logic
            return this.extractGenericContent();
        } catch (err) {
            console.error('ScholarAI extractResearchGate error:', err);
            return this.safeFallbackContent();
        }
    }

    extractIEEE() {
        try {
            // Placeholder for IEEE extraction logic
            return this.extractGenericContent();
        } catch (err) {
            console.error('ScholarAI extractIEEE error:', err);
            return this.safeFallbackContent();
        }
    }

    extractACM() {
        try {
            // Placeholder for ACM extraction logic
            return this.extractGenericContent();
        } catch (err) {
            console.error('ScholarAI extractACM error:', err);
            return this.safeFallbackContent();
        }
    }

    extractSpringer() {
        try {
            // Placeholder for Springer extraction logic
            return this.extractGenericContent();
        } catch (err) {
            console.error('ScholarAI extractSpringer error:', err);
            return this.safeFallbackContent();
        }
    }

    extractNature() {
        try {
            // Placeholder for Nature extraction logic
            return this.extractGenericContent();
        } catch (err) {
            console.error('ScholarAI extractNature error:', err);
            return this.safeFallbackContent();
        }
    }

    extractScienceDirect() {
        try {
            // Placeholder for ScienceDirect extraction logic
            return this.extractGenericContent();
        } catch (err) {
            console.error('ScholarAI extractScienceDirect error:', err);
            return this.safeFallbackContent();
        }
    }

    extractGenericContent() {
        try {
            const bodyText = document.body ? document.body.innerText : '';
            return {
                title: document.title,
                text: bodyText,
                url: window.location.href,
                type: 'generic',
                source: 'Web Page'
            };
        } catch (err) {
            console.error('ScholarAI extractGenericContent error:', err);
            return this.safeFallbackContent();
        }
    }

    detectAcademicContent() {
        // Optionally highlight or mark academic content on page
    }
}

// Initialize content extractor
new ContentExtractor(); 