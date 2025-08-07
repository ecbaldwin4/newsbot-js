const axios = require('axios');
const BaseEndpoint = require('../core/BaseEndpoint');
const EmbeddingService = require('../services/EmbeddingService');
const SimilarityChecker = require('../utils/SimilarityChecker');

class MarketauxEndpoint extends BaseEndpoint {
    constructor(config, dataManager) {
        super('marketaux', config, dataManager);
        this.apiConfig = config.getAPIConfig('marketaux');
        this.requestTimeout = 15000;
        this.dailyRequestLimit = 100;
        this.requestsToday = 0;
        this.lastRequestDate = '';
        
        // Vector embedding configuration
        this.vectorEmbeddingEnabled = config.getBotConfig().vectorEmbedding !== false;
        this.embeddingService = null;
        this.similarityChecker = null;
        
        // Set retention period to 7 days for financial news
        this.dataManager.setRetentionPeriod(this.name, 7 * 24 * 60 * 60);
        
        if (!this.apiConfig.token) {
            this.logError('Marketaux API token not configured');
            this.setEnabled(false);
        }
    }

    async initialize() {
        if (!this.apiConfig.token) {
            this.logError('Cannot initialize Marketaux endpoint - missing API token');
            return;
        }

        this.logInfo('Initializing Marketaux endpoint...');
        this.loadRequestCount();
        this.logInfo(`📊 Daily requests used: ${this.requestsToday}/${this.dailyRequestLimit}`);
        
        // Initialize vector embedding if enabled
        if (this.vectorEmbeddingEnabled) {
            this.logInfo('Initializing vector embedding for similarity detection...');
            this.embeddingService = new EmbeddingService({
                info: (msg, ...args) => this.logInfo(msg, ...args),
                success: (msg, ...args) => this.logInfo(msg, ...args),
                error: (msg, ...args) => this.logError(msg, ...args),
                debug: (msg, ...args) => this.logDebug(msg, ...args)
            });
            
            this.similarityChecker = new SimilarityChecker(
                this.embeddingService,
                this.dataManager,
                {
                    info: (msg, ...args) => this.logInfo(msg, ...args),
                    error: (msg, ...args) => this.logError(msg, ...args),
                    debug: (msg, ...args) => this.logDebug(msg, ...args),
                    warn: (msg, ...args) => this.logInfo(msg, ...args)
                },
                {
                    similarityThreshold: 0.85,
                    maxHistorySize: 500,
                    retentionHours: 48
                }
            );
            
            try {
                await this.embeddingService.initialize();
                await this.similarityChecker.loadRecentHeadlines(this.name);
                this.logInfo('✅ Vector embedding initialized successfully');
            } catch (error) {
                this.logError('❌ Failed to initialize vector embedding, disabling feature', error);
                this.vectorEmbeddingEnabled = false;
                this.embeddingService = null;
                this.similarityChecker = null;
            }
        }
        
        if (this.vectorEmbeddingEnabled) {
            this.logInfo('🧠 Vector embedding enabled for similarity detection');
        }
    }

    loadRequestCount() {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        try {
            const data = this.dataManager.loadCSVData('marketaux_request_count.csv', line => {
                const [date, count] = line.split(',');
                return { date, count: parseInt(count) || 0 };
            });
            
            const todayData = data.find(item => item.date === today);
            if (todayData) {
                this.requestsToday = todayData.count;
            } else {
                this.requestsToday = 0;
            }
            
            this.lastRequestDate = today;
        } catch (error) {
            this.logDebug('No existing request count data, starting fresh');
            this.requestsToday = 0;
            this.lastRequestDate = today;
        }
    }

    saveRequestCount() {
        const today = new Date().toISOString().split('T')[0];
        const data = [`${today},${this.requestsToday}`];
        this.dataManager.saveCSVData('marketaux_request_count.csv', data);
    }

    canMakeRequest() {
        const today = new Date().toISOString().split('T')[0];
        
        // Reset count if it's a new day
        if (today !== this.lastRequestDate) {
            this.requestsToday = 0;
            this.lastRequestDate = today;
        }
        
        return this.requestsToday < this.dailyRequestLimit;
    }

    incrementRequestCount() {
        this.requestsToday++;
        this.saveRequestCount();
        this.logInfo(`📊 API requests today: ${this.requestsToday}/${this.dailyRequestLimit}`);
        
        if (this.requestsToday >= this.dailyRequestLimit) {
            this.logInfo('⚠️ Daily request limit reached! Endpoint will be inactive until tomorrow.');
        }
    }

    async fetchUpdate() {
        if (!this.isEnabled || !this.apiConfig.token) {
            return null;
        }

        if (!this.canMakeRequest()) {
            this.logDebug('Daily request limit reached, skipping fetch');
            return null;
        }

        this.logDebug('Fetching Marketaux update...');
        
        try {
            const url = `${this.apiConfig.baseUrl}/news/all`;
            this.logInfo(`🌐 Making API call to: ${url}`);
            
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.apiConfig.token}`
                },
                params: {
                    filter_entities: true,
                    language: 'en',
                    limit: 10,
                    sort: 'published_at:desc'
                },
                timeout: this.requestTimeout
            });

            this.incrementRequestCount();
            
            // Debug: Log the API response structure
            this.logDebug('API response structure:', Object.keys(response.data || {}));
            
            // Extract articles from all categories (general, business, tech, etc.)
            const allArticles = [];
            const categories = response.data || {};
            
            Object.keys(categories).forEach(category => {
                if (Array.isArray(categories[category])) {
                    this.logDebug(`Found ${categories[category].length} articles in category: ${category}`);
                    allArticles.push(...categories[category]);
                }
            });
            
            this.logInfo(`✅ API call completed successfully for: ${url} (found ${allArticles.length} articles across all categories)`);
            
            for (const article of allArticles) {
                // Validate article has required fields
                if (!article || !article.uuid || !article.title || !article.url) {
                    this.logDebug('Skipping article with missing required fields:', article);
                    continue;
                }
                
                const articleId = article.uuid;
                const publishedAt = new Date(article.published_at);
                const hoursSincePublished = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
                
                // Only consider articles from the last 24 hours
                if (hoursSincePublished > 24) continue;
                
                // Skip if already seen
                if (this.hasSeenItem(articleId)) continue;
                
                // Validate that content is in English
                if (!this.isEnglishContent(article)) {
                    this.logDebug(`Skipping non-English article: "${article.title?.substring(0, 50)}..."`);
                    this.markItemAsSeen(articleId);
                    continue;
                }

                // Check for similarity if vector embedding is enabled
                if (this.vectorEmbeddingEnabled && this.similarityChecker) {
                    const similarityResult = await this.similarityChecker.checkSimilarity(article.title);
                    
                    if (similarityResult.isSimilar) {
                        this.logInfo(`🔄 REJECTED - Similar headline: "${article.title}" (similarity: ${(similarityResult.similarity * 100).toFixed(1)}% with "${similarityResult.similarHeadline}")`);
                        this.markItemAsSeen(articleId);
                        continue;
                    }
                }
                
                // Mark as seen
                this.markItemAsSeen(articleId);
                
                if (this.vectorEmbeddingEnabled && this.similarityChecker) {
                    await this.similarityChecker.addHeadline(article.title);
                    await this.similarityChecker.saveRecentHeadlines(this.name);
                }
                
                this.logDebug(`Selected article: "${article.title}" from ${article.source}`);
                
                return {
                    title: `Title: ${article.title}`,
                    url: article.url,
                    description: `Description: ${article.description || 'No description available'}`
                };
            }
            
        } catch (error) {
            if (error.response?.status === 402) {
                this.logError(`💳 Marketaux API requires a paid subscription (HTTP 402). Visit https://www.marketaux.com/pricing to upgrade your account.`);
            } else if (error.response?.status === 403) {
                this.logError(`🔑 Marketaux API access denied (HTTP 403). Check your API token or subscription level.`);
            } else if (error.response?.status === 429) {
                this.logError(`⏰ Marketaux API rate limit exceeded (HTTP 429). Daily limit: ${this.dailyRequestLimit} requests.`);
            } else {
                this.logError(`❌ Marketaux API call failed`, error.message || error);
            }
            // Don't increment request count on error
        }

        this.logDebug('No new Marketaux articles found');
        return null;
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    isEnglishContent(article) {
        // First check if the API language field indicates English
        if (article.language && article.language !== 'en') {
            return false;
        }
        
        // Basic English text validation using common English patterns
        const textToCheck = `${article.title || ''} ${article.description || ''}`.toLowerCase();
        
        // Skip if text is too short to validate
        if (textToCheck.trim().length < 10) {
            return true; // Assume English for very short content
        }
        
        // Common English words that are rarely found in other languages
        const englishIndicators = [
            'the', 'and', 'for', 'are', 'with', 'that', 'this', 'from', 'they', 'have',
            'been', 'their', 'said', 'each', 'which', 'what', 'will', 'there', 'could'
        ];
        
        // Count English indicators
        const englishWordCount = englishIndicators.reduce((count, word) => {
            return count + (textToCheck.includes(` ${word} `) || textToCheck.startsWith(`${word} `) ? 1 : 0);
        }, 0);
        
        // Require at least 2 common English words for longer content
        return englishWordCount >= 2;
    }

    getRemainingRequests() {
        if (!this.canMakeRequest()) {
            return 0;
        }
        return this.dailyRequestLimit - this.requestsToday;
    }

    getRequestStats() {
        const today = new Date().toISOString().split('T')[0];
        return {
            requestsToday: this.requestsToday,
            dailyLimit: this.dailyRequestLimit,
            remaining: this.getRemainingRequests(),
            date: today,
            canMakeRequest: this.canMakeRequest()
        };
    }

    isAPIConfigured() {
        return Boolean(this.apiConfig.token);
    }

    // Vector embedding control methods
    
    isVectorEmbeddingEnabled() {
        return this.vectorEmbeddingEnabled;
    }

    getSimilarityStats() {
        if (!this.vectorEmbeddingEnabled || !this.similarityChecker) {
            return { enabled: false };
        }

        return {
            enabled: true,
            ...this.similarityChecker.getStats(),
            cacheSize: this.embeddingService?.getCacheSize() || 0
        };
    }

    async shutdown() {
        await super.shutdown();
        
        if (this.vectorEmbeddingEnabled) {
            if (this.similarityChecker) {
                await this.similarityChecker.saveRecentHeadlines(this.name);
            }
            if (this.embeddingService) {
                await this.embeddingService.shutdown();
            }
        }
    }
}

module.exports = MarketauxEndpoint;