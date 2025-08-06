require('dotenv').config();

class Config {
    constructor() {
        this.validateRequiredEnvVars();
        this.loadConfiguration();
    }

    validateRequiredEnvVars() {
        const required = ['DISCORD_BOT_TOKEN'];
        const missing = required.filter(varName => !process.env[varName]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
    }

    loadConfiguration() {
        this.discord = {
            token: process.env.DISCORD_BOT_TOKEN,
            testChannel: process.env.TEST_CHANNEL,
            goChannel: process.env.GO_CHANNEL,
            tytanic: process.env.TYTANIC
        };

        this.apis = {
            congress: {
                token: process.env.CONGRESS_GOV_TOKEN,
                baseUrl: 'https://api.congress.gov/v3',
                currentCongress: 119
            },
            nasa: {
                token: process.env.NASA_TOKEN,
                baseUrl: 'https://api.nasa.gov'
            }
        };

        this.bot = {
            intervalMinutes: parseFloat(process.env.INTERVAL_MINUTES) || 1.25,
            testing: process.env.NODE_ENV === 'test' || process.env.TESTING === 'true',
            vectorEmbedding: process.env.VECTOR_EMBEDDING !== 'false', // Default enabled
            disableGUI: process.env.DISABLE_GUI === 'true'
        };

        this.secrets = {
            message: process.env.secret_message?.replace(/^"|"$/g, '') || '',
            reply: process.env.secret_reply?.replace(/^"|"$/g, '') || ''
        };

        this.endpoints = {
            enabled: (process.env.ENABLED_ENDPOINTS || 'reddit,congress').split(',').map(e => e.trim()),
            weights: this.parseWeights(process.env.ENDPOINT_WEIGHTS),
            reddit: {
                defaultSources: [
                    { author: 'any', url: 'https://www.reddit.com/r/news/new.json' }
                ]
            }
        };

        this.data = {
            directory: process.env.DATA_DIRECTORY || './data',
            retentionDays: parseInt(process.env.DATA_RETENTION_DAYS) || 7
        };

        if (this.bot.testing) {
            this.bot.intervalMinutes = 0.1;
        }
    }

    parseWeights(weightsString) {
        const weights = {};
        if (weightsString) {
            try {
                weightsString.split(',').forEach(pair => {
                    const [endpoint, weight] = pair.split(':');
                    if (endpoint && weight) {
                        weights[endpoint.trim()] = parseFloat(weight);
                    }
                });
            } catch (error) {
                console.error('Error parsing endpoint weights:', error);
            }
        }
        return weights;
    }

    getDiscordConfig() {
        return { ...this.discord };
    }

    getAPIConfig(service) {
        return this.apis[service] ? { ...this.apis[service] } : {};
    }

    getBotConfig() {
        return { ...this.bot };
    }

    getSecretsConfig() {
        return { ...this.secrets };
    }

    getEndpointsConfig() {
        return { ...this.endpoints };
    }

    getDataConfig() {
        return { ...this.data };
    }

    isEndpointEnabled(endpointName) {
        return this.endpoints.enabled.includes(endpointName);
    }

    getEndpointWeight(endpointName) {
        return this.endpoints.weights[endpointName] || 1;
    }

    isTesting() {
        return this.bot.testing;
    }

    getIntervalMinutes() {
        return this.bot.intervalMinutes;
    }
}

module.exports = Config;