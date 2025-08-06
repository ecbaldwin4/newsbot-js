const { EventEmitter } = require('events');

class BaseEndpoint extends EventEmitter {
    constructor(name, config, dataManager) {
        super();
        this.name = name;
        this.config = config;
        this.dataManager = dataManager;
        this.isEnabled = true;
        this.weight = 1; // For weighted random selection
    }

    async initialize() {
        throw new Error(`${this.name} endpoint must implement initialize() method`);
    }

    async fetchUpdate() {
        throw new Error(`${this.name} endpoint must implement fetchUpdate() method`);
    }

    async shutdown() {
        // Default implementation - endpoints can override if needed
        this.emit('shutdown');
    }

    setEnabled(enabled) {
        this.isEnabled = enabled;
        this.emit('enabledChanged', enabled);
    }

    setWeight(weight) {
        this.weight = Math.max(0, weight);
        this.emit('weightChanged', weight);
    }

    getName() {
        return this.name;
    }

    isEndpointEnabled() {
        return this.isEnabled;
    }

    getWeight() {
        return this.weight;
    }

    log(level, message, ...args) {
        this.emit('log', { level, message: `[${this.name}] ${message}`, args });
    }

    logError(message, error, ...args) {
        this.log('error', message, error, ...args);
    }

    logInfo(message, ...args) {
        this.log('info', message, ...args);
    }

    logDebug(message, ...args) {
        this.log('debug', message, ...args);
    }

    hasSeenItem(itemId) {
        return this.dataManager.hasSeenItem(this.name, itemId);
    }

    markItemAsSeen(itemId) {
        this.dataManager.markItemAsSeen(this.name, itemId);
    }

    validateNewsItem(item) {
        if (!item || typeof item !== 'object') {
            return false;
        }

        const requiredFields = ['title', 'url'];
        return requiredFields.every(field => item[field] && typeof item[field] === 'string');
    }

    formatNewsItem(rawData) {
        if (!this.validateNewsItem(rawData)) {
            throw new Error('Invalid news item format');
        }

        return {
            title: rawData.title.trim(),
            url: rawData.url.trim(),
            details: rawData.details || null,
            timestamp: new Date().toISOString(),
            source: this.name,
            metadata: rawData.metadata || {}
        };
    }
}

module.exports = BaseEndpoint;