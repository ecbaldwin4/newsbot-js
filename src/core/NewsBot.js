const { EventEmitter } = require('events');

class NewsBot extends EventEmitter {
    constructor(config, dataManager, discordService, logger) {
        super();
        this.config = config;
        this.dataManager = dataManager;
        this.discordService = discordService;
        this.logger = logger;
        
        this.endpoints = new Map();
        this.newsInterval = null;
        this.isRunning = false;
        
        // Adaptive interval system
        this.baseIntervalMinutes = config.getIntervalMinutes();
        this.currentIntervalMinutes = this.baseIntervalMinutes;
        this.maxIntervalMinutes = 60; // 1 hour max
        this.intervalIncrementSeconds = 30; // 30 seconds increment
        this.lastSuccessfulPost = Date.now();
        
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Discord service events
        this.discordService.on('ready', () => {
            this.emit('discordReady');
        });

        this.discordService.on('asteroidRequest', async (message) => {
            await this.handleAsteroidRequest(message);
        });

        this.discordService.on('congressRequest', async (message) => {
            await this.handleCongressRequest(message);
        });

        this.discordService.on('error', (error) => {
            this.logger.error('Discord service error', error);
        });

        // Endpoint events
        this.on('endpointAdded', (endpoint) => {
            this.logger.info(`Endpoint added: ${endpoint.getName()}`);
        });

        this.on('endpointRemoved', (endpointName) => {
            this.logger.info(`Endpoint removed: ${endpointName}`);
        });
    }

    async initialize() {
        this.logger.info('Initializing NewsBot...');
        
        // Initialize Discord service
        await this.discordService.initialize();
        
        // Initialize all endpoints
        for (const endpoint of this.endpoints.values()) {
            try {
                await endpoint.initialize();
                this.logger.info(`Initialized endpoint: ${endpoint.getName()}`);
            } catch (error) {
                this.logger.error(`Failed to initialize endpoint ${endpoint.getName()}`, error);
                endpoint.setEnabled(false);
            }
        }

        this.logger.success('NewsBot initialized successfully');
    }

    registerEndpoint(endpoint) {
        if (this.endpoints.has(endpoint.getName())) {
            throw new Error(`Endpoint ${endpoint.getName()} already registered`);
        }

        this.endpoints.set(endpoint.getName(), endpoint);
        
        // Set up endpoint event handlers
        endpoint.on('log', ({ level, message, args }) => {
            this.logger[level](message, ...args);
        });

        // Configure endpoint based on config
        const endpointConfig = this.config.getEndpointsConfig();
        endpoint.setEnabled(endpointConfig.enabled.includes(endpoint.getName()));
        endpoint.setWeight(endpointConfig.weights[endpoint.getName()] || 1);

        this.emit('endpointAdded', endpoint);
        this.logger.info(`Registered endpoint: ${endpoint.getName()}`);
    }

    unregisterEndpoint(endpointName) {
        const endpoint = this.endpoints.get(endpointName);
        if (endpoint) {
            endpoint.removeAllListeners();
            this.endpoints.delete(endpointName);
            this.emit('endpointRemoved', endpointName);
        }
    }

    getEndpoint(name) {
        return this.endpoints.get(name);
    }

    getEnabledEndpoints() {
        return Array.from(this.endpoints.values()).filter(endpoint => endpoint.isEndpointEnabled());
    }

    selectRandomEndpoint() {
        const enabledEndpoints = this.getEnabledEndpoints();
        if (enabledEndpoints.length === 0) {
            return null;
        }

        // Weighted random selection
        const totalWeight = enabledEndpoints.reduce((sum, endpoint) => sum + endpoint.getWeight(), 0);
        let random = Math.random() * totalWeight;

        for (const endpoint of enabledEndpoints) {
            random -= endpoint.getWeight();
            if (random <= 0) {
                return endpoint;
            }
        }

        // Fallback to first enabled endpoint
        return enabledEndpoints[0];
    }

    async fetchNews() {
        const enabledEndpoints = this.getEnabledEndpoints();
        if (enabledEndpoints.length === 0) {
            this.logger.warn('No enabled endpoints available');
            return null;
        }

        // Try all endpoints in random order until we find news
        const shuffledEndpoints = [...enabledEndpoints].sort(() => 0.5 - Math.random());
        
        for (const endpoint of shuffledEndpoints) {
            this.logger.debug(`Trying to fetch news from ${endpoint.getName()}`);
            
            try {
                const newsItem = await endpoint.fetchUpdate();
                if (newsItem) {
                    this.logger.info(`📰 News fetched from ${endpoint.getName()}: ${newsItem.title.substring(0, 50)}...`);
                    this.emit('newsFetched', newsItem, endpoint);
                    return newsItem;
                }
                this.logger.debug(`No news found from ${endpoint.getName()}`);
            } catch (error) {
                this.logger.error(`Error fetching news from ${endpoint.getName()}`, error);
                continue; // Try the next endpoint
            }
        }

        // If we get here, all endpoints have been tried and returned nothing
        this.logger.debug('🔍 All endpoints checked - no news found');
        return null;
    }

    async sendNews(newsItem) {
        let messageContent = newsItem.title;
        
        // Add description if available
        if (newsItem.description && newsItem.description.trim()) {
            messageContent += `\n\n${newsItem.description}`;
        }
        
        // Add details if available
        if (newsItem.details) {
            messageContent += `\n\n${newsItem.details}`;
        }
        
        // Add URL at the end (Discord will auto-embed)
        messageContent += `\n\nURL: ${newsItem.url}`;

        const success = await this.discordService.sendToChannels(messageContent);
        if (success) {
            this.emit('newsSent', newsItem);
        }
        return success;
    }

    async handleAsteroidRequest(message) {
        const asteroidEndpoint = this.getEndpoint('asteroid');
        if (!asteroidEndpoint) {
            await message.channel.send('Asteroid endpoint not available.');
            return;
        }

        try {
            const asteroids = await asteroidEndpoint.getAllAsteroidsForCommand();
            if (asteroids.length > 0) {
                await message.channel.send("The following asteroids are approaching Earth and have been labeled Potentially Hazardous by NASA:");
                
                for (const asteroid of asteroids.slice(0, 5)) { // Limit to 5 to avoid spam
                    const messageContent = `**Name**: ${asteroid.name}
**NASA URL**: ${asteroid.nasa_jpl_url}
**Estimated Diameter (max)**: ${asteroid.estimated_diameter.miles.estimated_diameter_max.toFixed(2)} miles
**Close Approach Date**: ${asteroid.close_approach_data[0].close_approach_date_full}
**Relative Velocity**: ${parseFloat(asteroid.close_approach_data[0].relative_velocity.miles_per_hour).toLocaleString()} mph
**Miss Distance**: ${parseFloat(asteroid.close_approach_data[0].miss_distance.miles).toLocaleString()} miles`;
                    await message.channel.send(messageContent);
                }
                
                if (asteroids.length > 5) {
                    await message.channel.send(`... and ${asteroids.length - 5} more asteroids.`);
                }
            } else {
                await message.channel.send("No potentially hazardous asteroids found...for now.");
            }
        } catch (error) {
            this.logger.error('Error handling asteroid request', error);
            await message.channel.send('Error fetching asteroid data.');
        }
    }

    async handleCongressRequest(message) {
        const congressEndpoint = this.getEndpoint('congress');
        if (!congressEndpoint) {
            await message.channel.send('Congress endpoint not available.');
            return;
        }

        try {
            const congressUpdate = await congressEndpoint.fetchUpdate();
            if (congressUpdate) {
                let messageContent;
                if (congressUpdate.details) {
                    messageContent = `${congressUpdate.title}\n${congressUpdate.details}\nURL: ${congressUpdate.url}`;
                } else {
                    messageContent = `${congressUpdate.title}\nURL: ${congressUpdate.url}`;
                }
                await message.channel.send(messageContent);
            } else {
                await message.channel.send("No recent congress updates found.");
            }
        } catch (error) {
            this.logger.error('Error handling congress request', error);
            await message.channel.send('Error fetching congress data.');
        }
    }

    startNewsLoop() {
        if (this.newsInterval) {
            this.logger.warn('News loop already running');
            return;
        }

        this.scheduleNextFetch();
        this.isRunning = true;
        this.emit('newsLoopStarted');
    }

    scheduleNextFetch() {
        const intervalMs = this.currentIntervalMinutes * 60 * 1000;
        this.logger.info(`⏰ Next fetch in ${this.currentIntervalMinutes} minutes`);

        this.newsInterval = setTimeout(async () => {
            try {
                const newsItem = await this.fetchNews();
                if (newsItem) {
                    await this.sendNews(newsItem);
                    this.onSuccessfulPost();
                } else {
                    this.onNoPostFound();
                }
                
                if (this.isRunning) {
                    this.scheduleNextFetch();
                }
            } catch (error) {
                this.logger.error('Error in news loop', error);
                if (this.isRunning) {
                    this.scheduleNextFetch();
                }
            }
        }, intervalMs);
    }

    onSuccessfulPost() {
        this.lastSuccessfulPost = Date.now();
        
        // Reset interval to base value
        if (this.currentIntervalMinutes !== this.baseIntervalMinutes) {
            this.currentIntervalMinutes = this.baseIntervalMinutes;
            this.logger.info(`📰 Post sent! Reset interval to ${this.currentIntervalMinutes} minutes`);
        }
    }

    onNoPostFound() {
        const enabledEndpoints = this.getEnabledEndpoints();
        const endpointNames = enabledEndpoints.map(e => e.getName()).join(', ');
        
        // Increase interval by 30 seconds (up to 60 minutes max)
        const incrementMinutes = this.intervalIncrementSeconds / 60;
        const newInterval = Math.min(this.currentIntervalMinutes + incrementMinutes, this.maxIntervalMinutes);
        
        if (newInterval > this.currentIntervalMinutes) {
            this.currentIntervalMinutes = newInterval;
            this.logger.info(`😴 All endpoints (${endpointNames}) returned no news. Increased interval to ${this.currentIntervalMinutes} minutes`);
        } else {
            this.logger.info(`😴 All endpoints (${endpointNames}) returned no news. Interval at maximum (${this.currentIntervalMinutes} minutes)`);
        }
    }

    stopNewsLoop() {
        if (this.newsInterval) {
            clearTimeout(this.newsInterval);
            this.newsInterval = null;
            this.isRunning = false;
            this.emit('newsLoopStopped');
            this.logger.info('News loop stopped');
        }
    }

    async start() {
        try {
            await this.initialize();
            this.startNewsLoop();
            this.emit('started');
            this.logger.success('NewsBot started successfully');
        } catch (error) {
            this.logger.error('Failed to start NewsBot', error);
            this.emit('error', error);
            throw error;
        }
    }

    async shutdown() {
        this.logger.info('Shutting down NewsBot...');
        
        this.stopNewsLoop();
        
        // Shutdown all endpoints
        for (const endpoint of this.endpoints.values()) {
            try {
                await endpoint.shutdown();
            } catch (error) {
                this.logger.error(`Error shutting down endpoint ${endpoint.getName()}`, error);
            }
        }
        
        // Shutdown Discord service
        await this.discordService.shutdown();
        
        // Shutdown data manager
        this.dataManager.shutdown();
        
        this.emit('shutdown');
        this.logger.success('NewsBot shut down successfully');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            discordConnected: this.discordService.isConnected(),
            enabledEndpoints: this.getEnabledEndpoints().map(e => e.getName()),
            totalEndpoints: this.endpoints.size,
            intervalMinutes: this.currentIntervalMinutes,
            baseIntervalMinutes: this.baseIntervalMinutes,
            maxIntervalMinutes: this.maxIntervalMinutes
        };
    }
}

module.exports = NewsBot;