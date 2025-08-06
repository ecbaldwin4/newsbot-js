const fs = require('fs');
const path = require('path');

class DataManager {
    constructor(dataDirectory = './data') {
        this.dataDirectory = dataDirectory;
        this.seenItems = new Map(); // endpointName -> Map(itemId -> timestamp)
        this.retentionPeriods = new Map(); // endpointName -> retention period in seconds
        
        this.ensureDataDirectory();
        this.loadAllData();
    }

    ensureDataDirectory() {
        if (!fs.existsSync(this.dataDirectory)) {
            fs.mkdirSync(this.dataDirectory, { recursive: true });
        }
    }

    setRetentionPeriod(endpointName, seconds) {
        this.retentionPeriods.set(endpointName, seconds);
    }

    getRetentionPeriod(endpointName) {
        return this.retentionPeriods.get(endpointName) || 24 * 60 * 60; // Default 24 hours
    }

    loadAllData() {
        try {
            const files = fs.readdirSync(this.dataDirectory);
            files.forEach(file => {
                if (file.endsWith('_seen_items.csv')) {
                    const endpointName = file.replace('_seen_items.csv', '');
                    this.loadSeenItems(endpointName);
                }
            });
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    loadSeenItems(endpointName) {
        const filePath = path.join(this.dataDirectory, `${endpointName}_seen_items.csv`);
        const seenItemsMap = new Map();

        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                data.split('\n').forEach(line => {
                    const [itemId, timestamp] = line.split(',');
                    if (itemId && timestamp) {
                        seenItemsMap.set(itemId, parseFloat(timestamp));
                    }
                });
            }
        } catch (error) {
            console.error(`Error loading seen items for ${endpointName}:`, error);
        }

        this.seenItems.set(endpointName, seenItemsMap);
        this.cleanupOldItems(endpointName);
    }

    saveSeenItems(endpointName) {
        const filePath = path.join(this.dataDirectory, `${endpointName}_seen_items.csv`);
        const seenItemsMap = this.seenItems.get(endpointName) || new Map();

        try {
            const entries = Array.from(seenItemsMap.entries())
                .map(([itemId, timestamp]) => `${itemId},${timestamp}`)
                .join('\n');
            fs.writeFileSync(filePath, entries, 'utf8');
        } catch (error) {
            console.error(`Error saving seen items for ${endpointName}:`, error);
        }
    }

    cleanupOldItems(endpointName) {
        const seenItemsMap = this.seenItems.get(endpointName);
        if (!seenItemsMap) return;

        const currentTime = Date.now() / 1000;
        const retentionPeriod = this.getRetentionPeriod(endpointName);
        
        const itemsToRemove = [];
        for (const [itemId, timestamp] of seenItemsMap.entries()) {
            if (currentTime - timestamp > retentionPeriod) {
                itemsToRemove.push(itemId);
            }
        }

        itemsToRemove.forEach(itemId => seenItemsMap.delete(itemId));
        
        if (itemsToRemove.length > 0) {
            this.saveSeenItems(endpointName);
        }
    }

    hasSeenItem(endpointName, itemId) {
        const seenItemsMap = this.seenItems.get(endpointName);
        return seenItemsMap ? seenItemsMap.has(itemId) : false;
    }

    markItemAsSeen(endpointName, itemId) {
        if (!this.seenItems.has(endpointName)) {
            this.seenItems.set(endpointName, new Map());
        }

        const seenItemsMap = this.seenItems.get(endpointName);
        seenItemsMap.set(itemId, Date.now() / 1000);
        this.saveSeenItems(endpointName);
    }

    getSeenItemsCount(endpointName) {
        const seenItemsMap = this.seenItems.get(endpointName);
        return seenItemsMap ? seenItemsMap.size : 0;
    }

    loadCSVData(filename, parser = null) {
        const filePath = path.join(this.dataDirectory, filename);
        
        try {
            if (!fs.existsSync(filePath)) {
                return [];
            }

            const data = fs.readFileSync(filePath, 'utf8');
            const lines = data.split('\n').filter(line => line.trim());
            
            if (parser && typeof parser === 'function') {
                return lines.map(parser).filter(Boolean);
            }
            
            return lines;
        } catch (error) {
            console.error(`Error loading CSV data from ${filename}:`, error);
            return [];
        }
    }

    saveCSVData(filename, data, formatter = null) {
        const filePath = path.join(this.dataDirectory, filename);
        
        try {
            let content;
            if (formatter && typeof formatter === 'function') {
                content = data.map(formatter).join('\n');
            } else if (Array.isArray(data)) {
                content = data.join('\n');
            } else {
                content = String(data);
            }
            
            fs.writeFileSync(filePath, content, 'utf8');
        } catch (error) {
            console.error(`Error saving CSV data to ${filename}:`, error);
        }
    }

    ensureFile(filename, defaultContent = '') {
        const filePath = path.join(this.dataDirectory, filename);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, defaultContent, 'utf8');
        }
    }
}

module.exports = DataManager;