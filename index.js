#!/usr/bin/env node

const Config = require('./src/config/Config');
const DataManager = require('./src/core/DataManager');
const DiscordService = require('./src/services/DiscordService');
const WebGUIService = require('./src/services/WebGUIService');
const NewsBot = require('./src/core/NewsBot');
const Logger = require('./src/utils/Logger');

// Import endpoint classes
const RedditEndpoint = require('./src/endpoints/RedditEndpoint');
const CongressEndpoint = require('./src/endpoints/CongressEndpoint');
const AsteroidEndpoint = require('./src/endpoints/AsteroidEndpoint');

class Application {
    constructor() {
        this.newsBot = null;
        this.webGuiService = null;
        this.logger = new Logger(process.env.LOG_LEVEL || 'info');
        this.setupProcessHandlers();
    }

    setupProcessHandlers() {
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            this.logger.info('Received SIGINT, shutting down gracefully...');
            await this.shutdown();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            this.logger.info('Received SIGTERM, shutting down gracefully...');
            await this.shutdown();
            process.exit(0);
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception', error);
            process.exit(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });
    }

    async initialize() {
        try {
            this.logger.info('🚀 Starting NewsBot Application...');

            // Initialize core components
            const config = new Config();
            const dataManager = new DataManager(config.getDataConfig().directory);
            const discordService = new DiscordService(config, dataManager, this.logger);
            
            // Create NewsBot instance
            this.newsBot = new NewsBot(config, dataManager, discordService, this.logger);

            // Register endpoints
            await this.registerEndpoints(config, dataManager);

            // Create and start Web GUI service (if not disabled)
            if (!config.getBotConfig().disableGUI) {
                this.webGuiService = new WebGUIService(this.newsBot, config, this.logger);
                try {
                    await this.webGuiService.start();
                } catch (error) {
                    this.logger.error('Failed to start Web GUI, continuing without it', error);
                    this.webGuiService = null;
                }
            }

            // Set up NewsBot event handlers
            this.setupNewsBotHandlers();

            this.logger.success('Application initialized successfully');
            return true;

        } catch (error) {
            this.logger.error('Failed to initialize application', error);
            throw error;
        }
    }

    async registerEndpoints(config, dataManager) {
        const endpointConfig = config.getEndpointsConfig();
        
        // Register Reddit endpoint
        if (endpointConfig.enabled.includes('reddit')) {
            const redditEndpoint = new RedditEndpoint(config, dataManager);
            this.newsBot.registerEndpoint(redditEndpoint);
        }

        // Register Congress endpoint
        if (endpointConfig.enabled.includes('congress')) {
            const congressEndpoint = new CongressEndpoint(config, dataManager);
            this.newsBot.registerEndpoint(congressEndpoint);
        }

        // Register Asteroid endpoint
        if (endpointConfig.enabled.includes('asteroid')) {
            const asteroidEndpoint = new AsteroidEndpoint(config, dataManager);
            this.newsBot.registerEndpoint(asteroidEndpoint);
        }


        this.logger.info(`Registered ${this.newsBot.getEnabledEndpoints().length} enabled endpoints`);
    }

    setupNewsBotHandlers() {
        this.newsBot.on('started', () => {
            this.logger.success('📡 NewsBot is now running!');
            this.printStatus();
        });

        this.newsBot.on('newsFetched', (newsItem, endpoint) => {
            this.logger.info(`📰 News from ${endpoint.getName()}: ${newsItem.title.substring(0, 60)}...`);
        });

        this.newsBot.on('newsSent', (newsItem) => {
            this.logger.success(`📤 Sent: ${newsItem.title.substring(0, 60)}...`);
        });

        this.newsBot.on('error', (error) => {
            this.logger.error('NewsBot error', error);
        });

        this.newsBot.on('shutdown', () => {
            this.logger.info('📴 NewsBot shut down');
        });
    }

    printStatus() {
        const status = this.newsBot.getStatus();
        this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.logger.info('📊 NewsBot Status:');
        this.logger.info(`   Running: ${status.isRunning ? '✅' : '❌'}`);
        this.logger.info(`   Discord: ${status.discordConnected ? '✅ Connected' : '❌ Disconnected'}`);
        this.logger.info(`   Interval: ${status.intervalMinutes} minutes`);
        this.logger.info(`   Endpoints: ${status.enabledEndpoints.join(', ')} (${status.enabledEndpoints.length}/${status.totalEndpoints})`);
        this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    async start() {
        try {
            await this.initialize();
            await this.newsBot.start();
        } catch (error) {
            this.logger.error('Failed to start application', error);
            process.exit(1);
        }
    }

    async shutdown() {
        if (this.webGuiService) {
            await this.webGuiService.stop();
        }
        if (this.newsBot) {
            await this.newsBot.shutdown();
        }
    }
}

// Start the application if this file is run directly
if (require.main === module) {
    const app = new Application();
    app.start().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = Application;