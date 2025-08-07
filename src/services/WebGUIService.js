const express = require('express');
const path = require('path');

class WebGUIService {
    constructor(newsBot, config, logger) {
        this.newsBot = newsBot;
        this.config = config;
        this.logger = logger;
        this.app = express();
        this.server = null;
        this.port = process.env.GUI_PORT || 3001;
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, '../gui')));
        
        // CORS for local development
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            next();
        });
    }

    setupRoutes() {
        // Main GUI page
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../gui/index.html'));
        });

        // API Routes
        this.app.get('/api/status', (req, res) => {
            try {
                const status = this.newsBot.getStatus();
                const redditEndpoint = this.newsBot.getEndpoint('reddit');
                const congressEndpoint = this.newsBot.getEndpoint('congress');
                const marketauxEndpoint = this.newsBot.getEndpoint('marketaux');
                
                const response = {
                    ...status,
                    endpoints: {
                        reddit: {
                            enabled: redditEndpoint?.isEndpointEnabled() || false,
                            weight: redditEndpoint?.getWeight() || 0,
                            sources: redditEndpoint?.getSourcesCount() || 0,
                            vectorEmbedding: redditEndpoint?.getSimilarityStats() || { enabled: false }
                        },
                        congress: {
                            enabled: congressEndpoint?.isEndpointEnabled() || false,
                            weight: congressEndpoint?.getWeight() || 0,
                            currentCongress: congressEndpoint?.getCurrentCongress() || 119,
                            apiConfigured: congressEndpoint?.isAPIConfigured() || false
                        },
                        marketaux: {
                            enabled: marketauxEndpoint?.isEndpointEnabled() || false,
                            weight: marketauxEndpoint?.getWeight() || 0,
                            apiConfigured: marketauxEndpoint?.isAPIConfigured() || false,
                            requestStats: marketauxEndpoint?.getRequestStats() || { requestsToday: 0, dailyLimit: 100, remaining: 100 }
                        }
                    }
                };
                
                res.json(response);
            } catch (error) {
                this.logger.error('Error getting status for GUI', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Vector Embedding Control
        this.app.post('/api/vector-embedding/:action', async (req, res) => {
            try {
                const redditEndpoint = this.newsBot.getEndpoint('reddit');
                if (!redditEndpoint) {
                    return res.status(404).json({ error: 'Reddit endpoint not found' });
                }

                let result;
                switch (req.params.action) {
                    case 'enable':
                        result = await redditEndpoint.enableVectorEmbedding();
                        break;
                    case 'disable':
                        result = await redditEndpoint.disableVectorEmbedding();
                        break;
                    case 'clear-cache':
                        result = redditEndpoint.clearSimilarityCache();
                        break;
                    default:
                        return res.status(400).json({ error: 'Invalid action' });
                }

                res.json(result);
            } catch (error) {
                this.logger.error('Error controlling vector embedding', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Update similarity threshold
        this.app.post('/api/similarity-threshold', async (req, res) => {
            try {
                const { threshold } = req.body;
                const redditEndpoint = this.newsBot.getEndpoint('reddit');
                
                if (!redditEndpoint) {
                    return res.status(404).json({ error: 'Reddit endpoint not found' });
                }

                const result = redditEndpoint.updateSimilarityThreshold(parseFloat(threshold));
                res.json(result);
            } catch (error) {
                this.logger.error('Error updating similarity threshold', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Reddit Sources Management
        this.app.get('/api/reddit/sources', (req, res) => {
            try {
                const redditEndpoint = this.newsBot.getEndpoint('reddit');
                if (!redditEndpoint) {
                    return res.status(404).json({ error: 'Reddit endpoint not found' });
                }

                const sources = Array.from(redditEndpoint.sources.entries()).map(([url, author]) => ({
                    url, author
                }));
                res.json({ sources });
            } catch (error) {
                this.logger.error('Error getting Reddit sources', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/reddit/sources', (req, res) => {
            try {
                const { author, url } = req.body;
                const redditEndpoint = this.newsBot.getEndpoint('reddit');
                
                if (!redditEndpoint) {
                    return res.status(404).json({ error: 'Reddit endpoint not found' });
                }

                redditEndpoint.addSource(author, url);
                res.json({ success: true, message: 'Source added successfully' });
            } catch (error) {
                this.logger.error('Error adding Reddit source', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/reddit/sources', (req, res) => {
            try {
                const { url } = req.body;
                const redditEndpoint = this.newsBot.getEndpoint('reddit');
                
                if (!redditEndpoint) {
                    return res.status(404).json({ error: 'Reddit endpoint not found' });
                }

                redditEndpoint.removeSource(url);
                res.json({ success: true, message: 'Source removed successfully' });
            } catch (error) {
                this.logger.error('Error removing Reddit source', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Endpoint Controls
        this.app.post('/api/endpoints/:name/:action', (req, res) => {
            try {
                const endpoint = this.newsBot.getEndpoint(req.params.name);
                if (!endpoint) {
                    return res.status(404).json({ error: 'Endpoint not found' });
                }

                switch (req.params.action) {
                    case 'enable':
                        endpoint.setEnabled(true);
                        break;
                    case 'disable':
                        endpoint.setEnabled(false);
                        break;
                    default:
                        return res.status(400).json({ error: 'Invalid action' });
                }

                res.json({ success: true, message: `Endpoint ${req.params.action}d successfully` });
            } catch (error) {
                this.logger.error('Error controlling endpoint', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Update endpoint weight
        this.app.post('/api/endpoints/:name/weight', (req, res) => {
            try {
                const { weight } = req.body;
                const endpoint = this.newsBot.getEndpoint(req.params.name);
                
                if (!endpoint) {
                    return res.status(404).json({ error: 'Endpoint not found' });
                }

                endpoint.setWeight(parseFloat(weight));
                res.json({ success: true, message: 'Weight updated successfully' });
            } catch (error) {
                this.logger.error('Error updating endpoint weight', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Manual news fetch
        this.app.post('/api/fetch/:endpoint', async (req, res) => {
            try {
                const endpoint = this.newsBot.getEndpoint(req.params.endpoint);
                if (!endpoint) {
                    return res.status(404).json({ error: 'Endpoint not found' });
                }

                const newsItem = await endpoint.fetchUpdate();
                if (newsItem) {
                    await this.newsBot.sendNews(newsItem);
                    res.json({ success: true, newsItem, message: 'News sent successfully' });
                } else {
                    res.json({ success: true, newsItem: null, message: 'No news found' });
                }
            } catch (error) {
                this.logger.error('Error manually fetching news', error);
                res.status(500).json({ error: error.message });
            }
        });
    }

    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    this.logger.success(`🌐 NewsBot GUI running at http://localhost:${this.port}`);
                    resolve();
                });

                this.server.on('error', (error) => {
                    this.logger.error('GUI server error', error);
                    reject(error);
                });

            } catch (error) {
                this.logger.error('Failed to start GUI server', error);
                reject(error);
            }
        });
    }

    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    this.logger.info('GUI server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = WebGUIService;