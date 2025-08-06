# NewsBot - Modular News Aggregation Bot

A scalable, object-oriented Discord bot that fetches news from multiple sources and delivers them to Discord channels.

## 🏗️ Architecture

The bot follows a modular, event-driven architecture with clear separation of concerns:

```
newsbot/
├── src/
│   ├── core/                    # Core framework
│   │   ├── NewsBot.js          # Main bot controller
│   │   ├── BaseEndpoint.js     # Abstract endpoint class
│   │   └── DataManager.js      # Data persistence abstraction
│   ├── endpoints/              # News source implementations
│   │   ├── RedditEndpoint.js   # Reddit news source
│   │   ├── CongressEndpoint.js # Congress API source
│   │   └── AsteroidEndpoint.js # NASA asteroid source
│   ├── services/               # External services
│   │   └── DiscordService.js   # Discord bot service
│   ├── config/                 # Configuration management
│   │   └── Config.js           # Environment & settings
│   └── utils/                  # Utilities
│       └── Logger.js           # Logging utility
├── data/                       # Data files (auto-created)
└── index.js                    # Entry point
```

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your tokens
   ```

3. **Run the bot:**
   ```bash
   node index.js
   ```

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token |
| `CONGRESS_GOV_TOKEN` | No | Congress.gov API token |
| `NASA_TOKEN` | No | NASA API token |
| `ENABLED_ENDPOINTS` | No | Comma-separated list (default: "reddit,congress") |
| `ENDPOINT_WEIGHTS` | No | Endpoint weights (format: "reddit:2,congress:1") |
| `INTERVAL_MINUTES` | No | News fetch interval (default: 1.25) |
| `TESTING` | No | Enable testing mode (true/false) |
| `LOG_LEVEL` | No | Logging level (debug/info/warn/error) |

### Discord Configuration
- `TEST_CHANNEL` - Channel ID for testing mode
- `GO_CHANNEL` - Special channel for keyword triggers
- `TYTANIC` - Message to send on keyword trigger
- `secret_message` - Secret message to respond to
- `secret_reply` - Reply to secret message

## 🔌 Adding New Endpoints

Creating a new news source is simple. Follow these steps:

### 1. Create Endpoint Class

Create a new file in `src/endpoints/YourEndpoint.js`:

```javascript
const axios = require('axios');
const BaseEndpoint = require('../core/BaseEndpoint');

class YourEndpoint extends BaseEndpoint {
    constructor(config, dataManager) {
        super('your-endpoint', config, dataManager);
        // Set retention period for your endpoint
        this.dataManager.setRetentionPeriod(this.name, 24 * 60 * 60);
    }

    async initialize() {
        this.logInfo('Initializing Your Endpoint...');
        // Initialize your endpoint (load config, validate API keys, etc.)
    }

    async fetchUpdate() {
        if (!this.isEnabled) {
            return null;
        }

        try {
            // Fetch data from your source
            const data = await this.fetchFromAPI();
            
            if (data && !this.hasSeenItem(data.id)) {
                this.markItemAsSeen(data.id);
                
                return this.formatNewsItem({
                    title: data.title,
                    url: data.url,
                    details: data.details // optional
                });
            }
        } catch (error) {
            this.logError('Error fetching update', error);
        }

        return null;
    }

    async fetchFromAPI() {
        // Implement your API fetching logic here
        // Return null if no new items found
    }
}

module.exports = YourEndpoint;
```

### 2. Register Endpoint

Add your endpoint to `index.js`:

```javascript
const YourEndpoint = require('./src/endpoints/YourEndpoint');

// In the registerEndpoints method:
if (endpointConfig.enabled.includes('your-endpoint')) {
    const yourEndpoint = new YourEndpoint(config, dataManager);
    this.newsBot.registerEndpoint(yourEndpoint);
}
```

### 3. Enable Endpoint

Add your endpoint to the environment variable:
```bash
ENABLED_ENDPOINTS=reddit,congress,your-endpoint
```

## 🎛️ Discord Commands

- `!ping` - Test bot responsiveness
- `!setchannel` - Register current channel for news updates
- `!asteroids` - Show hazardous asteroids
- `!congress` - Get latest Congress update

## 📊 Features

### Scalability
- **Modular Design**: Easy to add/remove news sources
- **Weighted Selection**: Configure probability of endpoint selection
- **Event-Driven**: Loose coupling between components
- **Dependency Injection**: Clean testable architecture

### Reliability  
- **Error Handling**: Graceful failure handling for each endpoint
- **Data Persistence**: Automatic duplicate prevention
- **Graceful Shutdown**: Clean shutdown with SIGINT/SIGTERM
- **Logging**: Structured logging with configurable levels

### Configuration
- **Environment-Based**: All configuration via environment variables
- **Runtime Changes**: Enable/disable endpoints without restart
- **Testing Mode**: Reduced intervals and test channel support

## 🔧 Development

### Adding Features to Existing Endpoints

Each endpoint class has methods you can override or extend:

```javascript
// Add custom data loading
async initialize() {
    await super.initialize();
    await this.loadCustomData();
}

// Add custom validation
isValidItem(item) {
    return super.isValidItem(item) && this.customValidation(item);
}

// Add custom formatting
formatNewsItem(rawData) {
    const newsItem = super.formatNewsItem(rawData);
    newsItem.customField = this.addCustomField(rawData);
    return newsItem;
}
```

### Debugging

Enable debug logging:
```bash
LOG_LEVEL=debug node index.js
```

## 📁 Data Management

The bot automatically creates and manages these data files:

- `target_channels.csv` - Discord channels for news delivery
- `{endpoint}_seen_items.csv` - Tracks seen items to prevent duplicates
- `reddit_sources.csv` - Reddit sources configuration
- `banned_keywords.csv` - Keywords to filter out

## 🚦 Status Monitoring

The bot provides detailed status information on startup and includes event logging for monitoring news flow and system health.

## 🛠️ Contributing

1. Follow the existing code patterns
2. Add comprehensive error handling
3. Include appropriate logging
4. Update documentation
5. Test with various scenarios

## 📝 License

ISC License - see package.json for details.