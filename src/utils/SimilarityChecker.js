class SimilarityChecker {
    constructor(embeddingService, dataManager, logger, options = {}) {
        this.embeddingService = embeddingService;
        this.dataManager = dataManager;
        this.logger = logger;
        
        this.options = {
            similarityThreshold: options.similarityThreshold || 0.85, // High threshold for duplicate detection
            maxHistorySize: options.maxHistorySize || 500, // Maximum headlines to keep in memory
            retentionHours: options.retentionHours || 48, // How long to keep headlines for comparison
            ...options
        };

        this.recentHeadlines = new Map(); // headline -> { embedding, timestamp }
    }

    async loadRecentHeadlines(endpointName) {
        try {
            const headlines = this.dataManager.loadCSVData(
                `${endpointName}_recent_headlines.csv`,
                line => {
                    const [headline, timestamp] = line.split('|||'); // Use ||| as separator to avoid comma conflicts
                    return headline && timestamp ? { headline: headline.trim(), timestamp: parseFloat(timestamp) } : null;
                }
            );

            this.logger.debug(`Loading ${headlines.length} recent headlines for ${endpointName}`);

            // Filter out old headlines
            const cutoffTime = Date.now() / 1000 - (this.options.retentionHours * 60 * 60);
            const validHeadlines = headlines.filter(item => item.timestamp > cutoffTime);

            this.logger.debug(`Kept ${validHeadlines.length} valid headlines after filtering`);

            // Load embeddings for valid headlines
            if (validHeadlines.length > 0) {
                const headlineTexts = validHeadlines.map(item => item.headline);
                const embeddings = await this.embeddingService.getEmbeddings(headlineTexts);

                validHeadlines.forEach((item, index) => {
                    if (embeddings[index]) {
                        this.recentHeadlines.set(item.headline, {
                            embedding: embeddings[index],
                            timestamp: item.timestamp
                        });
                    }
                });
            }

            this.logger.info(`Loaded ${this.recentHeadlines.size} recent headlines with embeddings for ${endpointName}`);

        } catch (error) {
            this.logger.error(`Error loading recent headlines for ${endpointName}:`, error);
        }
    }

    async saveRecentHeadlines(endpointName) {
        try {
            const cutoffTime = Date.now() / 1000 - (this.options.retentionHours * 60 * 60);
            const validEntries = Array.from(this.recentHeadlines.entries())
                .filter(([_, data]) => data.timestamp > cutoffTime)
                .map(([headline, data]) => `${headline}|||${data.timestamp}`);

            this.dataManager.saveCSVData(`${endpointName}_recent_headlines.csv`, validEntries);
            this.logger.debug(`Saved ${validEntries.length} recent headlines for ${endpointName}`);

        } catch (error) {
            this.logger.error(`Error saving recent headlines for ${endpointName}:`, error);
        }
    }

    async checkSimilarity(newHeadline) {
        try {
            // Get embedding for new headline
            const newEmbedding = await this.embeddingService.getEmbedding(newHeadline);
            if (!newEmbedding) {
                this.logger.warn('Could not generate embedding for new headline');
                return { isSimilar: false, similarity: 0, similarHeadline: null };
            }

            // Check against all recent headlines
            let maxSimilarity = 0;
            let mostSimilarHeadline = null;

            for (const [headline, data] of this.recentHeadlines.entries()) {
                const similarity = this.embeddingService.cosineSimilarity(newEmbedding, data.embedding);
                
                if (similarity > maxSimilarity) {
                    maxSimilarity = similarity;
                    mostSimilarHeadline = headline;
                }
            }

            const isSimilar = maxSimilarity >= this.options.similarityThreshold;

            if (isSimilar) {
                this.logger.debug(`Similar headline detected: ${maxSimilarity.toFixed(3)} similarity with "${mostSimilarHeadline.substring(0, 50)}..."`);
            }

            return {
                isSimilar,
                similarity: maxSimilarity,
                similarHeadline: mostSimilarHeadline
            };

        } catch (error) {
            this.logger.error('Error checking headline similarity:', error);
            return { isSimilar: false, similarity: 0, similarHeadline: null };
        }
    }

    async addHeadline(headline) {
        try {
            const embedding = await this.embeddingService.getEmbedding(headline);
            if (embedding) {
                this.recentHeadlines.set(headline, {
                    embedding,
                    timestamp: Date.now() / 1000
                });

                // Prune old entries to prevent memory bloat
                this.pruneOldHeadlines();
            }
        } catch (error) {
            this.logger.error('Error adding headline to similarity checker:', error);
        }
    }

    pruneOldHeadlines() {
        const cutoffTime = Date.now() / 1000 - (this.options.retentionHours * 60 * 60);
        const initialSize = this.recentHeadlines.size;

        // Remove old entries
        for (const [headline, data] of this.recentHeadlines.entries()) {
            if (data.timestamp < cutoffTime) {
                this.recentHeadlines.delete(headline);
            }
        }

        // Limit total size
        if (this.recentHeadlines.size > this.options.maxHistorySize) {
            const entries = Array.from(this.recentHeadlines.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp); // Sort by timestamp
            
            const toDelete = entries.slice(0, this.recentHeadlines.size - this.options.maxHistorySize);
            toDelete.forEach(([headline]) => {
                this.recentHeadlines.delete(headline);
            });
        }

        const removedCount = initialSize - this.recentHeadlines.size;
        if (removedCount > 0) {
            this.logger.debug(`Pruned ${removedCount} old headlines, kept ${this.recentHeadlines.size}`);
        }
    }

    getStats() {
        return {
            totalHeadlines: this.recentHeadlines.size,
            threshold: this.options.similarityThreshold,
            retentionHours: this.options.retentionHours,
            maxHistorySize: this.options.maxHistorySize
        };
    }

    updateThreshold(newThreshold) {
        this.options.similarityThreshold = Math.max(0, Math.min(1, newThreshold));
        this.logger.info(`Similarity threshold updated to ${this.options.similarityThreshold}`);
    }

    clear() {
        this.recentHeadlines.clear();
        this.logger.info('Similarity checker cleared');
    }
}

module.exports = SimilarityChecker;