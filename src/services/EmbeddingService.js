const tf = require('@tensorflow/tfjs-node');
const use = require('@tensorflow-models/universal-sentence-encoder');

class EmbeddingService {
    constructor(logger) {
        this.logger = logger;
        this.model = null;
        this.isInitialized = false;
        this.cache = new Map(); // Cache embeddings to avoid recomputation
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            this.logger.info('Initializing Universal Sentence Encoder...');
            
            // Set TensorFlow backend to CPU for Node.js
            await tf.setBackend('cpu');
            
            // Load the Universal Sentence Encoder model
            this.model = await use.load();
            
            this.isInitialized = true;
            this.logger.success('Universal Sentence Encoder initialized successfully');
            
        } catch (error) {
            this.logger.error('Failed to initialize Universal Sentence Encoder', error);
            throw error;
        }
    }

    async getEmbedding(text) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Check cache first
        if (this.cache.has(text)) {
            return this.cache.get(text);
        }

        try {
            // Get embedding for the text
            const embeddings = await this.model.embed([text]);
            const embeddingArray = await embeddings.arraySync();
            const embedding = embeddingArray[0]; // Get first (and only) embedding
            
            // Cache the result
            this.cache.set(text, embedding);
            
            // Cleanup tensors to prevent memory leaks
            embeddings.dispose();
            
            return embedding;
            
        } catch (error) {
            this.logger.error(`Error getting embedding for text: "${text.substring(0, 50)}..."`, error);
            return null;
        }
    }

    async getEmbeddings(texts) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // Filter texts not in cache
            const uncachedTexts = [];
            const uncachedIndices = [];
            const results = new Array(texts.length);

            texts.forEach((text, index) => {
                if (this.cache.has(text)) {
                    results[index] = this.cache.get(text);
                } else {
                    uncachedTexts.push(text);
                    uncachedIndices.push(index);
                }
            });

            // Get embeddings for uncached texts
            if (uncachedTexts.length > 0) {
                const embeddings = await this.model.embed(uncachedTexts);
                const embeddingArrays = await embeddings.arraySync();
                
                // Store results and cache them
                embeddingArrays.forEach((embedding, i) => {
                    const originalIndex = uncachedIndices[i];
                    const text = uncachedTexts[i];
                    
                    results[originalIndex] = embedding;
                    this.cache.set(text, embedding);
                });

                // Cleanup tensors
                embeddings.dispose();
            }

            return results;
            
        } catch (error) {
            this.logger.error('Error getting embeddings for multiple texts', error);
            return texts.map(() => null);
        }
    }

    cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length !== vecB.length) {
            return 0;
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    async calculateSimilarity(text1, text2) {
        const [embedding1, embedding2] = await this.getEmbeddings([text1, text2]);
        
        if (!embedding1 || !embedding2) {
            return 0;
        }

        return this.cosineSimilarity(embedding1, embedding2);
    }

    findMostSimilar(targetEmbedding, candidateEmbeddings, threshold = 0.8) {
        let maxSimilarity = -1;
        let mostSimilarIndex = -1;

        candidateEmbeddings.forEach((embedding, index) => {
            if (!embedding) return;
            
            const similarity = this.cosineSimilarity(targetEmbedding, embedding);
            if (similarity > maxSimilarity) {
                maxSimilarity = similarity;
                mostSimilarIndex = index;
            }
        });

        return {
            index: mostSimilarIndex,
            similarity: maxSimilarity,
            isSimilar: maxSimilarity >= threshold
        };
    }

    clearCache() {
        this.cache.clear();
        this.logger.info('Embedding cache cleared');
    }

    getCacheSize() {
        return this.cache.size;
    }

    // Clean up old cache entries to prevent memory bloat
    pruneCache(maxSize = 1000) {
        if (this.cache.size > maxSize) {
            const entries = Array.from(this.cache.entries());
            const entriesToDelete = entries.slice(0, this.cache.size - maxSize);
            
            entriesToDelete.forEach(([key]) => {
                this.cache.delete(key);
            });
            
            this.logger.info(`Pruned embedding cache: removed ${entriesToDelete.length} entries`);
        }
    }

    async shutdown() {
        this.clearCache();
        if (this.model) {
            // TensorFlow.js models don't have explicit dispose methods
            this.model = null;
        }
        this.isInitialized = false;
        this.logger.info('EmbeddingService shut down');
    }
}

module.exports = EmbeddingService;