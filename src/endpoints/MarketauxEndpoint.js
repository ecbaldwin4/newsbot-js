const axios = require('axios');
const BaseEndpoint = require('../core/BaseEndpoint');

class MarketauxEndpoint extends BaseEndpoint {
    constructor(config, dataManager) {
        super('marketaux', config, dataManager);
        this.apiConfig = config.getAPIConfig('marketaux');
        this.requestTimeout = 15000;
        this.dailyRequestLimit = 100;
        this.requestsToday = 0;
        this.lastRequestDate = '';
        
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
            this.logInfo(`✅ API call completed successfully for: ${url} (found ${response.data?.data?.length || 0} articles)`);

            const articles = response.data?.data || [];
            
            for (const article of articles) {
                const articleId = article.uuid;
                const publishedAt = new Date(article.published_at);
                const hoursSincePublished = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
                
                // Only consider articles from the last 24 hours
                if (hoursSincePublished > 24) continue;
                
                // Skip if already seen
                if (this.hasSeenItem(articleId)) continue;
                
                // Mark as seen
                this.markItemAsSeen(articleId);
                
                // Build details string
                let details = `Published: ${this.formatDate(article.published_at)}`;
                
                // Add source information
                if (article.source) {
                    details += `\nSource: ${article.source}`;
                }
                
                // Add entities (companies, people, etc.)
                if (article.entities && article.entities.length > 0) {
                    const entityNames = article.entities
                        .filter(e => e.name && e.relevance_score > 0.7)
                        .slice(0, 3) // Limit to top 3 most relevant
                        .map(e => e.name);
                    
                    if (entityNames.length > 0) {
                        details += `\nRelated: ${entityNames.join(', ')}`;
                    }
                }
                
                // Add sentiment if available
                if (article.sentiment && article.sentiment !== 'neutral') {
                    const sentimentEmoji = article.sentiment === 'positive' ? '📈' : '📉';
                    details += `\nSentiment: ${sentimentEmoji} ${article.sentiment}`;
                }
                
                return {
                    title: `💰 MARKET NEWS: ${article.title}`,
                    url: article.url,
                    description: article.description || '',
                    details: details
                };
            }
            
        } catch (error) {
            this.logError(`❌ API call failed for Marketaux`, error);
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
}

module.exports = MarketauxEndpoint;