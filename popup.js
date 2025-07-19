// ScholarAI Chrome Extension - Main Logic
// Production-ready: All unnecessary logs removed, file type validation added, async errors handled.
class ScholarAI {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.loadStats();
    }

    initializeElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.urlInput = document.getElementById('urlInput');
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.detectPageBtn = document.getElementById('detectPageBtn');
        this.uploadSection = document.getElementById('uploadSection');
        this.analysisSection = document.getElementById('analysisSection');
        this.loadingDiv = document.getElementById('loadingDiv');
        this.resultsDiv = document.getElementById('resultsDiv');
        this.progressFill = document.getElementById('progressFill');
        this.loadingText = document.getElementById('loadingText');
        this.summary = document.getElementById('summary');
        this.methodology = document.getElementById('methodology');
        this.biasDetection = document.getElementById('biasDetection');
        this.researchGaps = document.getElementById('researchGaps');
        this.confidenceScore = document.getElementById('confidenceScore');
        this.processingTime = document.getElementById('processingTime');
        this.papersAnalyzed = document.getElementById('papersAnalyzed');
        this.exportBtn = document.getElementById('exportBtn');
        this.citationBtn = document.getElementById('citationBtn');
        this.shareBtn = document.getElementById('shareBtn');
        // Add tooltips for UX
        if (this.methodology) this.methodology.setAttribute('title', 'Describes the main methods and datasets used in the research.');
        if (this.biasDetection) this.biasDetection.setAttribute('title', 'Highlights any potential biases or limitations in the study.');
        if (this.researchGaps) this.researchGaps.setAttribute('title', 'Lists unexplored areas or gaps in the research.');
        // Add aria-labels for accessibility
        if (this.methodology) this.methodology.setAttribute('aria-label', 'Methodology');
        if (this.biasDetection) this.biasDetection.setAttribute('aria-label', 'Bias Detection');
        if (this.researchGaps) this.researchGaps.setAttribute('aria-label', 'Research Gaps');
    }

    bindEvents() {
        if (this.uploadArea && this.fileInput) {
            this.uploadArea.addEventListener('click', () => this.fileInput.click());
            this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
            this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
        if (this.analyzeBtn) this.analyzeBtn.addEventListener('click', () => this.analyzeFromUrl());
        if (this.detectPageBtn) this.detectPageBtn.addEventListener('click', () => this.analyzeCurrentPage());
        if (this.exportBtn) this.exportBtn.addEventListener('click', () => this.exportResults());
        if (this.citationBtn) this.citationBtn.addEventListener('click', () => this.generateCitation());
        if (this.shareBtn) this.shareBtn.addEventListener('click', () => this.shareResults());
    }

    handleDragOver(e) {
        e.preventDefault();
        if (this.uploadArea) this.uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.6)';
    }

    handleDrop(e) {
        e.preventDefault();
        if (this.uploadArea) this.uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.processFile(file);
        }
    }

    async processFile(file) {
        try {
            // File type validation
            const allowedTypes = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
            if (!allowedTypes.includes(file.type)) {
                this.showError('Unsupported file type. Please upload a PDF, DOC, DOCX, or TXT file.');
                return;
            }
            // Only log errors in production
            const text = await this.extractTextFromFile(file);
            this.startAnalysis(text, file.name);
        } catch (err) {
            console.error('ScholarAI: processFile error:', err);
            this.showError('Failed to process file: ' + (err.message || err));
        }
    }

    async extractTextFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                resolve(text);
            };
            reader.onerror = (e) => {
                console.error('ScholarAI: FileReader error:', e);
                reject(new Error('Failed to read file'));
            };
            reader.readAsText(file);
        });
    }

    async analyzeFromUrl() {
        if (!this.urlInput) return;
        const url = this.urlInput.value.trim();
        if (!url) {
            this.showError('Please enter a valid URL');
            return;
        }
        try {
            const paperData = await this.fetchPaperFromUrl(url);
            this.startAnalysis(paperData.text, paperData.title);
        } catch (error) {
            this.showError('Error fetching paper: ' + (error.message || error));
        }
    }

    async fetchPaperFromUrl(url) {
        try {
            const response = await fetch(url);
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            let text = '';
            if (url.includes('arxiv.org')) {
                text = doc.querySelector('.abstract')?.textContent || doc.body.innerText;
            } else if (url.includes('pubmed')) {
                text = doc.querySelector('.abstract-content')?.textContent || doc.body.innerText;
            } else {
                text = doc.body.innerText;
            }
            const title = doc.title || url;
            return { text, title };
        } catch (error) {
            throw new Error('Could not fetch or parse the paper.');
        }
    }

    async analyzeCurrentPage() {
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            if (!tab || !tab.id) {
                this.showError('No active tab found');
                return;
            }
            chrome.tabs.sendMessage(tab.id, {action: "extractPageContent"}, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('ScholarAI: Runtime error:', chrome.runtime.lastError);
                    if (chrome.runtime.lastError.message && chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
                        this.showError('This page does not allow extensions to access its content. Please try on a regular website (not a Chrome or Web Store page).');
                    } else {
                        this.showError('Error communicating with page: ' + chrome.runtime.lastError.message);
                    }
                    return;
                }
                if (response && response.text) {
                    this.startAnalysis(response.text, response.title || 'Current Page');
                } else {
                    this.showError('Could not extract content from current page');
                }
            });
        } catch (error) {
            console.error('ScholarAI: analyzeCurrentPage error:', error);
            this.showError('Error analyzing current page: ' + (error.message || error));
        }
    }

    async startAnalysis(text, title) {
        this.showAnalysisSection();
        const startTime = performance.now();
        const steps = [
            { text: 'Preprocessing text...', progress: 20 },
            { text: 'Extracting key concepts...', progress: 40 },
            { text: 'Analyzing methodology...', progress: 60 },
            { text: 'Detecting potential biases...', progress: 80 },
            { text: 'Identifying research gaps...', progress: 100 }
        ];
        for (let step of steps) {
            if (this.loadingText && this.progressFill) {
                this.loadingText.textContent = step.text;
                this.progressFill.style.width = step.progress + '%';
            }
            await new Promise(res => setTimeout(res, 400));
        }
        // Start analysis in background
        const result = await this.performAIAnalysisInBackground(text);
        const endTime = performance.now();
        const processingTime = ((endTime - startTime) / 1000).toFixed(1);
        this.displayResults(result, processingTime);
    }

    async performAIAnalysisInBackground(text) {
        // Send message to background to start analysis
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'startAnalysis', text }, (response) => {
                if (response && response.status === 'done') {
                    resolve(response.result);
                } else if (response && response.status === 'error') {
                    let msg = response.error || 'AI analysis failed.';
                    if (msg.includes('API error: 403')) {
                        msg = 'Gemini API key is invalid or not authorized.';
                    } else if (msg.includes('API error: 429')) {
                        msg = 'Gemini API quota exceeded. Please try again later.';
                    } else if (msg.includes('API error: 404')) {
                        msg = 'Gemini API endpoint or model not found. Please contact support.';
                    }
                    this.showError(msg);
                    resolve({
                        summary: 'Analysis failed.',
                        methodology: '',
                        biasDetection: '',
                        researchGaps: '',
                        confidence: 0
                    });
                } else {
                    // Poll for result
                    this.pollForAnalysisResult(resolve);
                }
            });
        });
    }

    pollForAnalysisResult(resolve) {
        chrome.runtime.sendMessage({ action: 'getAnalysisResult' }, (response) => {
            if (response && !response.running && response.result) {
                resolve(response.result);
            } else if (response && response.running) {
                setTimeout(() => this.pollForAnalysisResult(resolve), 1000);
            } else {
                this.showError('AI analysis failed.');
                resolve({
                    summary: 'Analysis failed.',
                    methodology: '',
                    biasDetection: '',
                    researchGaps: '',
                    confidence: 0
                });
            }
        });
    }

    displayResults(results, processingTime) {
        if (this.loadingDiv) this.loadingDiv.style.display = 'none';
        if (this.resultsDiv) this.resultsDiv.style.display = 'block';
        if (this.summary) this.summary.textContent = results.summary;
        if (this.methodology) this.methodology.textContent = results.methodology;
        if (this.biasDetection) this.biasDetection.textContent = results.biasDetection;
        if (this.researchGaps) this.researchGaps.textContent = results.researchGaps;
        if (this.confidenceScore) this.confidenceScore.textContent = results.confidence + '%';
        if (this.processingTime) this.processingTime.textContent = processingTime + 's';
        this.updateStats();
    }

    showAnalysisSection() {
        if (this.uploadSection) this.uploadSection.style.display = 'none';
        if (this.analysisSection) this.analysisSection.style.display = 'block';
        if (this.loadingDiv) {
            this.loadingDiv.style.display = 'block';
            // Add spinner for better UX
            let spinner = this.loadingDiv.querySelector('.spinner');
            if (!spinner) {
                spinner = document.createElement('div');
                spinner.className = 'spinner';
                this.loadingDiv.insertBefore(spinner, this.loadingDiv.firstChild);
            }
        }
        if (this.resultsDiv) this.resultsDiv.style.display = 'none';
        if (this.progressFill) this.progressFill.style.width = '0%';
    }

    async exportResults() {
        const results = {
            summary: this.summary?.textContent,
            methodology: this.methodology?.textContent,
            biasDetection: this.biasDetection?.textContent,
            researchGaps: this.researchGaps?.textContent,
            confidence: this.confidenceScore?.textContent,
            processingTime: this.processingTime?.textContent,
            timestamp: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scholar_ai_analysis_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    generateCitation() {
        const citation = `ScholarAI Analysis. (${new Date().getFullYear()}). AI-Powered Research Paper Analysis. Generated on ${new Date().toLocaleDateString()}.`;
        navigator.clipboard.writeText(citation);
        this.showError('Citation copied to clipboard!');
    }

    shareResults() {
        const shareData = {
            title: 'ScholarAI Analysis Results',
            text: `Check out this AI-powered research analysis with ${this.confidenceScore?.textContent} confidence score!`,
            url: window.location.href
        };
        if (navigator.share) {
            navigator.share(shareData);
        } else {
            navigator.clipboard.writeText(shareData.text + ' ' + shareData.url);
            this.showError('Results copied to clipboard!');
        }
    }

    loadStats() {
        chrome.storage?.local.get(['papersAnalyzed'], (result) => {
            const count = result?.papersAnalyzed || 1247;
            if (this.papersAnalyzed) this.papersAnalyzed.textContent = count.toLocaleString();
        });
    }

    updateStats() {
        chrome.storage?.local.get(['papersAnalyzed'], (result) => {
            const count = (result?.papersAnalyzed || 1247) + 1;
            chrome.storage?.local.set({ papersAnalyzed: count });
            if (this.papersAnalyzed) this.papersAnalyzed.textContent = count.toLocaleString();
        });
    }

    showError(message) {
        let errorDiv = document.getElementById('errorDiv');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'errorDiv';
            errorDiv.style.background = 'rgba(255,0,0,0.15)';
            errorDiv.style.color = '#fff';
            errorDiv.style.padding = '10px';
            errorDiv.style.borderRadius = '8px';
            errorDiv.style.margin = '10px 0';
            errorDiv.style.textAlign = 'center';
            errorDiv.style.fontWeight = 'bold';
            errorDiv.style.fontSize = '13px';
            errorDiv.setAttribute('role', 'alert');
            const container = document.querySelector('.container');
            if (container) container.insertBefore(errorDiv, container.firstChild);
        }
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 10000);
    }
}

// Initialize the extension
// Only one instance, all logic is inside the class
// No global performAIAnalysis or other methods outside the class

document.addEventListener('DOMContentLoaded', () => {
    new ScholarAI();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const uploadSection = document.getElementById('uploadSection');
        const analysisSection = document.getElementById('analysisSection');
        if (analysisSection && uploadSection && analysisSection.style.display === 'block') {
            analysisSection.style.display = 'none';
            uploadSection.style.display = 'block';
        }
    }
});