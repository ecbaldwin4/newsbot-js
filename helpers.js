const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Function to get a random endpoint from the CSV file
function getRandomEndpoint() {
    const filePath = path.join(__dirname, 'data', 'endpoint_selector.csv');

    try {
        // Read file content
        const data = fs.readFileSync(filePath, 'utf8');

        // Split by lines and filter out empty lines
        const endpoints = data.split('\n').map(line => line.trim()).filter(Boolean);

        if (endpoints.length === 0) {
            console.log('No endpoints found in the CSV file.');
            return null;
        }

        // Pick a random endpoint
        const randomEndpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
        return randomEndpoint;

    } catch (error) {
        console.error('Error reading the CSV file:', error);
        return null;
    }
}


async function fetchHazardousAsteroids() {
    const NASA_API_URL = 'https://api.nasa.gov/neo/rest/v1/feed';
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    try {
        const response = await axios.get(NASA_API_URL, {
            params: {
                start_date: startDate,
                end_date: endDate,
                api_key: process.env.NASA_TOKEN
            }
        });

        const data = response.data;
        const hazardousAsteroids = [];

        for (const date in data.near_earth_objects) {
            for (const asteroid of data.near_earth_objects[date]) {
                if (asteroid.is_potentially_hazardous_asteroid) {
                    const approachDate = new Date(asteroid.close_approach_data[0].close_approach_date_full);
                    const today = new Date();

                    if (approachDate >= today) {
                        hazardousAsteroids.push(asteroid);
                    }
                }
            }
        }

        return hazardousAsteroids;
    } catch (error) {
        console.error('Error fetching asteroid data:', error);
        return [];
    }
}


module.exports = { getRandomEndpoint, fetchHazardousAsteroids };