const fs = require('fs');
const path = require('path');
const axios = require('axios');

// File paths
const DATA_FOLDER = path.join(__dirname, '../data');
const POST_IDS_FILE = path.join(DATA_FOLDER, 'reddit_seen_post_ids.csv');
const SOURCES_FILE = path.join(DATA_FOLDER, 'reddit_sources.csv');
const BANNED_KEYWORDS_FILE = path.join(DATA_FOLDER, 'banned_keywords.csv');

class Reddit {
    constructor() {
        this.seenPostIds = this.loadSeenPostIds();
        this.sources = this.loadSources();
    }

    loadSeenPostIds() {
        try {
            const data = fs.readFileSync(POST_IDS_FILE, 'utf8');
            const lines = data.split('\n');
            const seenPostIds = {};
            lines.forEach(line => {
                const [postId, timestamp] = line.split(',');
                if (postId && timestamp) {
                    seenPostIds[postId] = parseFloat(timestamp);
                }
            });
            return seenPostIds;
        } catch (error) {
            return {};
        }
    }

    saveSeenPostIds() {
        const currentTime = Date.now() / 1000;
        const validEntries = Object.entries(this.seenPostIds)
            .filter(([_, timestamp]) => currentTime - timestamp < 86400)
            .map(([postId, timestamp]) => `${postId},${timestamp}`)
            .join('\n');

        fs.writeFileSync(POST_IDS_FILE, validEntries, 'utf8');
    }

    hasSeenPost(postId) {
        return postId in this.seenPostIds;
    }

    markPostAsSeen(postId) {
        this.seenPostIds[postId] = Date.now() / 1000;
        this.saveSeenPostIds();
    }

    loadSources() {
        const sources = {};
        try {
            const data = fs.readFileSync(SOURCES_FILE, 'utf8');
            const lines = data.split('\n').slice(1);
            lines.forEach(line => {
                const [author, jsonUrl] = line.split(',');
                if (author && jsonUrl) {
                    sources[jsonUrl] = author;
                }
            });
        } catch (error) {
            console.error('Error loading sources:', error);
        }
        return sources;
    }

    getRandomSource() {
        const sourceEntries = Object.entries(this.sources);
        if (sourceEntries.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * sourceEntries.length);
        return sourceEntries[randomIndex];
    }

    async getLatestPostFromAnySource() {
        const shuffledSources = Object.entries(this.sources).sort(() => 0.5 - Math.random());

        for (const [jsonUrl, author] of shuffledSources) {
            const latestPost = await this.getLatestPost(jsonUrl, author);
            if (latestPost) {
                console.log(`Latest post found from ${jsonUrl}`);
                return latestPost;
            }
        }
        return null;
    }

    async getLatestPost(jsonUrl, author) {
        const bannedKeywords = this.loadBannedKeywords();
        const thresholdTimestamp = Math.floor(Date.now() / 1000) - 86400;
    
        try {
            const response = await axios.get(jsonUrl, { headers: { 'User-Agent': 'news_feed_monitor' } });
            const posts = response.data?.data?.children || [];
    
            for (const post of posts) {
                const { id: postId, title, created_utc: createdUtc, author: postAuthor } = post.data;
                const url = post.data.url_overridden_by_dest || post.data.url || '';
    
                if (createdUtc < thresholdTimestamp) continue;
                if (author !== 'any' && postAuthor !== author) continue;
                if (!url || this.isUrlBanned(url, bannedKeywords)) {
                    this.markPostAsSeen(postId);
                    continue;
                }
                if (this.hasSeenPost(postId)) continue;
    
                this.markPostAsSeen(postId);
                return { title, url };
            }
        } catch (error) {
            console.error(`Error fetching posts from ${jsonUrl}:`, error);
        }
        return null;
    }
    
    // Helper method to check if the URL contains any banned keywords
    isUrlBanned(url, bannedKeywords) {
        // Ensure keywords and URL are both in lowercase and trimmed to avoid mismatches
        return bannedKeywords.some(keyword => {
            return url.toLowerCase().includes(keyword.trim().toLowerCase());
        });
    }

    loadBannedKeywords() {
        const bannedKeywords = new Set();
        try {
            const data = fs.readFileSync(BANNED_KEYWORDS_FILE, 'utf8');
            data.split('\n').forEach(line => {
                line.split(',').forEach(keyword => {
                    if (keyword) bannedKeywords.add(keyword);
                });
            });
        } catch (error) {
            console.error('Error loading banned keywords:', error);
        }
        return Array.from(bannedKeywords);
    }
}

module.exports = Reddit;
