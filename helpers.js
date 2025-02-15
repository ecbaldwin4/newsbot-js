const fs = require('fs');
const path = require('path');

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

module.exports = { getRandomEndpoint };
