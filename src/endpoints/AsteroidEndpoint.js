const axios = require('axios');
const BaseEndpoint = require('../core/BaseEndpoint');

class AsteroidEndpoint extends BaseEndpoint {
    constructor(config, dataManager) {
        super('asteroid', config, dataManager);
        this.apiConfig = config.getAPIConfig('nasa');
        this.requestTimeout = 15000; // Longer timeout for NASA API
        
        // Set retention period to 7 days for asteroids
        this.dataManager.setRetentionPeriod(this.name, 7 * 24 * 60 * 60);
        
        if (!this.apiConfig.token) {
            this.logError('NASA API token not configured');
            this.setEnabled(false);
        }
    }

    async initialize() {
        if (!this.apiConfig.token) {
            this.logError('Cannot initialize Asteroid endpoint - missing NASA API token');
            return;
        }

        this.logInfo('Initializing Asteroid endpoint...');
    }

    async fetchUpdate() {
        if (!this.isEnabled || !this.apiConfig.token) {
            return null;
        }

        this.logDebug('Fetching asteroid updates...');
        
        const asteroids = await this.fetchHazardousAsteroids();
        
        for (const asteroid of asteroids) {
            const asteroidId = asteroid.id;
            
            if (this.hasSeenItem(asteroidId)) continue;
            
            this.markItemAsSeen(asteroidId);
            
            const title = `☄️ HAZARDOUS ASTEROID: ${asteroid.name}`;
            const details = this.formatAsteroidDetails(asteroid);
            
            this.logInfo(`Found new hazardous asteroid: ${asteroid.name}`);
            
            return this.formatNewsItem({
                title,
                url: asteroid.nasa_jpl_url,
                details,
                metadata: {
                    diameter: asteroid.estimated_diameter.miles.estimated_diameter_max,
                    closeApproachDate: asteroid.close_approach_data[0].close_approach_date_full,
                    velocity: asteroid.close_approach_data[0].relative_velocity.miles_per_hour,
                    missDistance: asteroid.close_approach_data[0].miss_distance.miles
                }
            });
        }

        this.logDebug('No new hazardous asteroids found');
        return null;
    }

    async fetchHazardousAsteroids() {
        const NASA_API_URL = `${this.apiConfig.baseUrl}/neo/rest/v1/feed`;
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        try {
            const response = await axios.get(NASA_API_URL, {
                params: {
                    start_date: startDate,
                    end_date: endDate,
                    api_key: this.apiConfig.token
                },
                timeout: this.requestTimeout
            });

            const data = response.data;
            const hazardousAsteroids = [];

            for (const date in data.near_earth_objects) {
                for (const asteroid of data.near_earth_objects[date]) {
                    if (asteroid.is_potentially_hazardous_asteroid) {
                        const approachDate = new Date(asteroid.close_approach_data[0].close_approach_date_full);
                        const today = new Date();

                        // Only include future approaches
                        if (approachDate >= today) {
                            hazardousAsteroids.push(asteroid);
                        }
                    }
                }
            }

            // Sort by approach date (earliest first)
            hazardousAsteroids.sort((a, b) => {
                const dateA = new Date(a.close_approach_data[0].close_approach_date_full);
                const dateB = new Date(b.close_approach_data[0].close_approach_date_full);
                return dateA - dateB;
            });

            this.logDebug(`Found ${hazardousAsteroids.length} hazardous asteroids`);
            return hazardousAsteroids;
        } catch (error) {
            this.logError('Error fetching asteroid data', error);
            return [];
        }
    }

    formatAsteroidDetails(asteroid) {
        const diameter = asteroid.estimated_diameter.miles.estimated_diameter_max;
        const approachDate = asteroid.close_approach_data[0].close_approach_date_full;
        const velocity = asteroid.close_approach_data[0].relative_velocity.miles_per_hour;
        const missDistance = asteroid.close_approach_data[0].miss_distance.miles;
        
        return `Diameter: ${diameter.toFixed(2)} miles | ` +
               `Approach: ${this.formatDate(approachDate)} | ` +
               `Speed: ${parseFloat(velocity).toLocaleString()} mph | ` +
               `Distance: ${parseFloat(missDistance).toLocaleString()} miles`;
    }

    formatDate(dateString) {
        try {
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return dateString;
        }
    }

    async getAsteroidDetails(asteroidId) {
        if (!this.apiConfig.token) {
            throw new Error('NASA API token not configured');
        }

        try {
            const response = await axios.get(
                `${this.apiConfig.baseUrl}/neo/rest/v1/neo/${asteroidId}`,
                {
                    params: { api_key: this.apiConfig.token },
                    timeout: this.requestTimeout
                }
            );

            return response.data;
        } catch (error) {
            this.logError(`Error fetching asteroid details for ${asteroidId}`, error);
            return null;
        }
    }

    async getAllAsteroidsForCommand() {
        // This method returns all hazardous asteroids for the !asteroids command
        return await this.fetchHazardousAsteroids();
    }

    isAPIConfigured() {
        return !!this.apiConfig.token;
    }

    getApiUrl() {
        return this.apiConfig.baseUrl;
    }
}

module.exports = AsteroidEndpoint;