// ScholarAI Background Service Worker

let currentAnalysis = null;
let currentResult = null;

chrome.runtime.onInstalled.addListener(() => {
    // Remove any existing context menu to prevent duplicates
    try {
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: 'analyzePage',
                title: 'Analyze this page with ScholarAI',
                contexts: ['page']
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Context menu creation error:', chrome.runtime.lastError);
                }
            });
        });
    } catch (error) {
        console.error('Error setting up context menu:', error);
    }
});

if (chrome.contextMenus) {
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        if (info.menuItemId === 'analyzePage' && tab.id) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                chrome.tabs.sendMessage(tab.id, { action: 'extractPageContent' }, async (response) => {
                    if (response && response.text) {
                        try {
                            const resultText = await analyzePaperWithGemini(response.text);
                            const parsed = parseGeminiResponse(resultText);
                            chrome.notifications.create({
                                type: 'basic',
                                iconUrl: 'icon128.png',
                                title: 'ScholarAI Analysis Complete',
                                message: parsed.summary.substring(0, 200) + (parsed.summary.length > 200 ? '...' : '')
                            });
                        } catch (err) {
                            chrome.notifications.create({
                                type: 'basic',
                                iconUrl: 'icon128.png',
                                title: 'ScholarAI Analysis Failed',
                                message: err && err.message ? err.message : 'Unknown error during analysis.'
                            });
                        }
                    } else {
                        chrome.notifications.create({
                            type: 'basic',
                            iconUrl: 'icon128.png',
                            title: 'ScholarAI',
                            message: 'Could not extract content from this page.'
                        });
                    }
                });
            } catch (err) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icon128.png',
                    title: 'ScholarAI',
                    message: 'Error injecting content script or analyzing page.'
                });
            }
        }
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startAnalysis') {
        currentAnalysis = true;
        currentResult = null;
        analyzePaperWithGemini(message.text)
            .then(resultText => {
                const parsed = parseGeminiResponse(resultText);
                // Confidence: based on answer completeness (all fields filled)
                let confidence = 80;
                if (parsed.summary && parsed.methodology && parsed.bias && parsed.gaps) {
                    confidence = 95;
                } else if ((parsed.summary && parsed.methodology) || (parsed.bias && parsed.gaps)) {
                    confidence = 90;
                }
                currentResult = {
                    summary: parsed.summary,
                    methodology: parsed.methodology,
                    biasDetection: parsed.bias,
                    researchGaps: parsed.gaps,
                    confidence
                };
                currentAnalysis = false;
                sendResponse({ status: 'done', result: currentResult });
            })
            .catch(error => {
                console.error('ScholarAI Background: AI analysis failed:', error);
                currentAnalysis = false;
                sendResponse({ status: 'error', error: error && error.message ? error.message : 'Unknown error during analysis.' });
            });
        return true;
    } else if (message.action === 'getAnalysisResult') {
        sendResponse({
            running: !!currentAnalysis,
            result: currentResult
        });
        return true;
    }
    return false;
});

// Gemini API integration with improved prompt for accuracy and structure
async function analyzePaperWithGemini(paperText) {
    // Improved, explicit prompt for more accurate and structured answers
    const prompt = `You are an expert academic reviewer. Analyze the following research paper and provide:
1. A concise, clear summary (2-3 sentences).
2. A detailed description of the main methodology and datasets used (be specific).
3. A critical analysis of any potential biases or limitations (be objective and cite examples).
4. Suggestions for unexplored research areas or literature gaps (be actionable and relevant).
Format your answer as:
1. Summary: ...
2. Methodology: ...
3. Bias: ...
4. Gaps: ...

Paper:
${paperText}`;
    const apiKey = 'AIzaSyCAZoUHZnuH9Ijtw26RgkJdnq5ZLNMY2Jc';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    const body = {
        contents: [{ parts: [{ text: prompt }] }]
    };
    let response, data;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            throw new Error('API error: ' + response.status + ' ' + response.statusText);
        }
        data = await response.json();
        const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!resultText) {
            throw new Error('Invalid API response');
        }
        return resultText;
    } catch (err) {
        throw err;
    }
}

// Improved parser for Gemini response with robust field extraction
function parseGeminiResponse(text) {
    // Accept both numbered and labeled formats
    const regex = /1\.?\s*(Summary:)?\s*(.*?)\n2\.?\s*(Methodology:)?\s*(.*?)\n3\.?\s*(Bias:)?\s*(.*?)\n4\.?\s*(Gaps:)?\s*(.*)/s;
    const match = text.match(regex);
    if (match) {
        return {
            summary: match[2].trim(),
            methodology: match[4].trim(),
            bias: match[6].trim(),
            gaps: match[8].trim()
        };
    } else {
        // Fallback: try to split by lines
        const lines = text.split('\n');
        return {
            summary: lines[0] || '',
            methodology: lines[1] || '',
            bias: lines[2] || '',
            gaps: lines[3] || ''
        };
    }
}