const axios = require('axios');
const BaseEndpoint = require('../core/BaseEndpoint');

class RedditEndpoint extends BaseEndpoint {
    constructor(config, dataManager) {
        super('reddit', config, dataManager);
        this.sources = new Map();
        this.bannedKeywords = [];
        this.userAgent = 'news_feed_monitor';
        this.requestTimeout = 10000;
        
        // Set retention period to 24 hours for Reddit posts
        this.dataManager.setRetentionPeriod(this.name, 24 * 60 * 60);
    }

    async initialize() {
        this.logInfo('Initializing Reddit endpoint...');
        await this.loadSources();
        await this.loadBannedKeywords();
        this.logInfo(`Loaded ${this.sources.size} sources and ${this.bannedKeywords.length} banned keywords`);
    }

    async loadSources() {
        this.dataManager.ensureFile('reddit_sources.csv', 'author,json_url\nany,https://www.reddit.com/r/news/new.json\n');
        
        const sources = this.dataManager.loadCSVData('reddit_sources.csv', line => {
            const [author, jsonUrl] = line.split(',');
            return author && jsonUrl ? { author: author.trim(), jsonUrl: jsonUrl.trim() } : null;
        });

        this.sources.clear();
        sources.forEach(({ author, jsonUrl }) => {
            if (!jsonUrl.includes('author')) { // Skip header
                this.sources.set(jsonUrl, author);
            }
        });

        if (this.sources.size === 0) {
            // Add default source if none exist
            const defaultSource = this.config.getEndpointsConfig().reddit.defaultSources[0];
            this.sources.set(defaultSource.url, defaultSource.author);
        }
    }

    async loadBannedKeywords() {
        this.dataManager.ensureFile('banned_keywords.csv', '');
        
        const keywords = this.dataManager.loadCSVData('banned_keywords.csv', line => {
            return line.split(',').map(keyword => keyword.trim()).filter(Boolean);
        });

        this.bannedKeywords = keywords.flat();
    }

    async fetchUpdate() {
        if (!this.isEnabled) {
            return null;
        }

        this.logDebug('Fetching Reddit update...');
        
        // Shuffle sources for random selection
        const sourceEntries = Array.from(this.sources.entries()).sort(() => 0.5 - Math.random());

        for (const [jsonUrl, author] of sourceEntries) {
            const post = await this.fetchFromSource(jsonUrl, author);
            if (post) {
                this.logInfo(`Found new post: ${post.title.substring(0, 50)}...`);
                return this.formatNewsItem(post);
            }
        }

        this.logDebug('No new Reddit posts found');
        return null;
    }

    async fetchFromSource(jsonUrl, author) {
        const thresholdTimestamp = Math.floor(Date.now() / 1000) - 24 * 60 * 60; // 24 hours ago

        try {
            const response = await axios.get(jsonUrl, {
                headers: { 'User-Agent': this.userAgent },
                timeout: this.requestTimeout
            });

            const posts = response.data?.data?.children || [];

            for (const post of posts) {
                const postData = post.data;
                const {
                    id: postId,
                    title,
                    created_utc: createdUtc,
                    author: postAuthor
                } = postData;

                const url = postData.url_overridden_by_dest || postData.url || '';

                // Skip old posts
                if (createdUtc < thresholdTimestamp) continue;

                // Skip if author doesn't match (unless 'any')
                if (author !== 'any' && postAuthor !== author) continue;

                // Skip if URL is invalid or banned
                if (!url || this.isUrlBanned(url)) {
                    this.markItemAsSeen(postId);
                    continue;
                }

                // Skip if already seen
                if (this.hasSeenItem(postId)) continue;

                // Mark as seen and return
                this.markItemAsSeen(postId);
                return { title, url };
            }
        } catch (error) {
            this.logError(`Error fetching from ${jsonUrl}`, error);
        }

        return null;
    }

    isUrlBanned(url) {
        const lowerUrl = url.toLowerCase();
        return this.bannedKeywords.some(keyword => 
            lowerUrl.includes(keyword.toLowerCase())
        );
    }

    getRandomSource() {
        const sourceEntries = Array.from(this.sources.entries());
        if (sourceEntries.length === 0) return null;
        
        const randomIndex = Math.floor(Math.random() * sourceEntries.length);
        return sourceEntries[randomIndex];
    }

    getSourcesCount() {
        return this.sources.size;
    }

    getBannedKeywordsCount() {
        return this.bannedKeywords.length;
    }

    addSource(author, jsonUrl) {
        this.sources.set(jsonUrl, author);
        this.saveSources();
    }

    removeSource(jsonUrl) {
        this.sources.delete(jsonUrl);
        this.saveSources();
    }

    saveSources() {
        const data = ['author,json_url'];
        this.sources.forEach((author, jsonUrl) => {
            data.push(`${author},${jsonUrl}`);
        });
        
        this.dataManager.saveCSVData('reddit_sources.csv', data);
    }

    addBannedKeyword(keyword) {
        if (!this.bannedKeywords.includes(keyword)) {
            this.bannedKeywords.push(keyword);
            this.saveBannedKeywords();
        }
    }

    removeBannedKeyword(keyword) {
        const index = this.bannedKeywords.indexOf(keyword);
        if (index > -1) {
            this.bannedKeywords.splice(index, 1);
            this.saveBannedKeywords();
        }
    }

    saveBannedKeywords() {
        this.dataManager.saveCSVData('banned_keywords.csv', this.bannedKeywords.join(','));
    }
}

module.exports = RedditEndpoint;