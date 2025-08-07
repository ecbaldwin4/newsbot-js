const axios = require('axios');
const BaseEndpoint = require('../core/BaseEndpoint');
const EmbeddingService = require('../services/EmbeddingService');
const SimilarityChecker = require('../utils/SimilarityChecker');

class TheNewsAPIEndpoint extends BaseEndpoint {
    constructor(config, dataManager) {
        super('thenewsapi', config, dataManager);
        this.apiConfig = config.getAPIConfig('thenewsapi');
        this.requestTimeout = 15000;
        
        // Vector embedding configuration
        this.vectorEmbeddingEnabled = config.getBotConfig().vectorEmbedding !== false;
        this.embeddingService = null;
        this.similarityChecker = null;
        
        // Set retention period to 24 hours for news articles
        this.dataManager.setRetentionPeriod(this.name, 24 * 60 * 60);
        
        if (!this.apiConfig.token) {
            this.logError('TheNewsAPI token not configured');
            this.setEnabled(false);
        }
    }

    async initialize() {
        if (!this.apiConfig.token) {
            this.logError('Cannot initialize TheNewsAPI endpoint - missing API token');
            return;
        }

        this.logInfo('Initializing TheNewsAPI endpoint...');
        
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
        
        this.logInfo('TheNewsAPI endpoint initialized');
        if (this.vectorEmbeddingEnabled) {
            this.logInfo('🧠 Vector embedding enabled for similarity detection');
        }
    }

    async fetchUpdate() {
        if (!this.isEnabled || !this.apiConfig.token) {
            return null;
        }

        this.logDebug('Fetching TheNewsAPI update...');
        
        // Try headlines endpoint first, then top endpoint
        const endpoints = [
            { name: 'headlines', url: `${this.apiConfig.baseUrl}/news/headlines` },
            { name: 'top', url: `${this.apiConfig.baseUrl}/news/top` }
        ];

        for (const endpoint of endpoints) {
            const article = await this.fetchFromEndpoint(endpoint);
            if (article) {
                return article;
            }
        }

        this.logDebug('No new TheNewsAPI articles found');
        return null;
    }

    async fetchFromEndpoint(endpoint) {
        try {
            const url = endpoint.url;
            this.logInfo(`🌐 Making API call to: ${url} (${endpoint.name})`);
            
            const response = await axios.get(url, {
                params: {
                    api_token: this.apiConfig.token,
                    language: 'en',
                    limit: 10,
                    sort: 'published_at:desc'
                },
                timeout: this.requestTimeout
            });

            this.logInfo(`✅ API call completed successfully for: ${url} (found ${response.data?.data?.length || 0} articles)`);

            const articles = response.data?.data || [];
            
            for (const article of articles) {
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
                
                // Mark as seen and add to similarity checker
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
                this.logError(`💳 TheNewsAPI requires a paid subscription (HTTP 402). Visit https://www.thenewsapi.com/pricing to upgrade your account.`);
            } else if (error.response?.status === 403) {
                this.logError(`🔑 TheNewsAPI access denied (HTTP 403). Check your API token or subscription level.`);
            } else if (error.response?.status === 429) {
                this.logError(`⏰ TheNewsAPI rate limit exceeded (HTTP 429). Please wait before making more requests.`);
            } else {
                this.logError(`❌ API call failed for: ${endpoint.url}`, error.message || error);
            }
        }

        return null;
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

module.exports = TheNewsAPIEndpoint;