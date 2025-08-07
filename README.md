# NewsBot - Modular News Aggregation Bot 🤖

A scalable, object-oriented Discord bot that fetches news from multiple sources and delivers them to Discord channels. Now featuring AI-powered duplicate detection, web control panel, and Docker support!

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

## 🚀 Quick Start with Docker (Recommended)

### Prerequisites
- Docker and Docker Compose installed
- Discord bot token

### 1. Clone and Configure
```bash
git clone <repository-url>
cd new-newsbot-js
```

Create a `.env` file:
```env
# Required
DISCORD_BOT_TOKEN=your_discord_bot_token_here

# Optional
TEST_CHANNEL=your_test_channel_id
GO_CHANNEL=your_main_channel_id
CONGRESS_GOV_TOKEN=your_congress_token
NASA_TOKEN=your_nasa_token
MARKETAUX_TOKEN=your_marketaux_token
ENABLED_ENDPOINTS=reddit,congress,marketaux
VECTOR_EMBEDDING=true
LOG_LEVEL=info
```

### 2. Deploy with Docker
```bash
# Start the bot
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the bot
docker-compose down
```

🎛️ **Web Control Panel**: http://localhost:3001

## 🛠️ Manual Installation (Alternative)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
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

## 🐳 Docker Management

### Container Operations
```bash
# View container status
docker-compose ps

# Restart the bot
docker-compose restart

# Update the bot
git pull
docker-compose build --no-cache
docker-compose up -d

# View detailed logs
docker-compose logs -f newsbot

# Access container shell
docker-compose exec newsbot /bin/bash

# Remove everything (including data)
docker-compose down -v
```

### Data Persistence
The `./data` directory is mounted as a volume, ensuring your configuration and cache data persists across container restarts.

### Health Monitoring
The container includes health checks that monitor the web GUI. Check health status:
```bash
docker-compose ps  # Shows health status
docker inspect newsbot-js | grep Health  # Detailed health info
```

### Resource Usage
```bash
# View resource usage
docker stats newsbot-js

# Set resource limits in docker-compose.yml:
deploy:
  resources:
    limits:
      memory: 1G
      cpus: '0.5'
```

## 🎛️ Web Control Panel

Access the control panel at http://localhost:3001 to:

- ✅ Monitor bot status and Discord connection
- 🎚️ Enable/disable news sources and adjust weights  
- 📱 Manage Reddit sources
- 🧠 Control vector embedding settings
- 📊 View API request statistics
- 🔧 Manually fetch news for testing
- 📈 Monitor similarity detection performance

## 📰 News Sources

1. **Reddit** - Configurable subreddits with duplicate filtering
2. **Congress** - Latest bills, votes, and legislative updates  
3. **Marketaux** - Financial news (100 requests/day limit)
4. **TheNewsAPI** - General news (100 requests/day free tier)
5. **NASA Asteroids** - Potentially hazardous asteroid alerts

## 🧠 AI-Powered Features

- **Vector Embedding**: Uses TensorFlow Universal Sentence Encoder
- **Duplicate Detection**: Prevents similar headlines with 85% similarity threshold
- **Smart Caching**: Optimized embedding cache for performance
- **Adaptive Intervals**: Automatically adjusts based on news availability

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

## 🔧 Troubleshooting

### Docker Issues

```bash
# Check container health
docker-compose ps

# View detailed logs
docker-compose logs newsbot

# Rebuild container completely
docker-compose build --no-cache

# Reset everything (careful - removes data)
docker-compose down -v && docker-compose up -d
```

### Common Issues

- **402 Payment Required**: TheNewsAPI free tier limit exceeded (100 requests/day). Wait for reset or upgrade your account.
- **403 API Errors**: Check API tokens are valid and subscription limits aren't exceeded
- **Vector Embedding Memory**: Ensure at least 1GB RAM available for TensorFlow
- **Discord Connection**: Verify bot token and server permissions in Discord Developer Portal
- **GUI Not Loading**: Check port 3001 isn't in use by another service (`docker-compose ps`)
- **Container Won't Start**: Check Docker daemon is running (`docker --version`)
- **Reddit "anime_titties" logs**: This is a legitimate world news subreddit (despite the name) that provides quality international news coverage

### Getting Help

1. Check the logs: `docker-compose logs -f`
2. Verify environment variables in `.env`
3. Test API tokens independently
4. Check Discord bot permissions

## 📈 Deployment Options

### Production Deployment
```bash
# Use production environment file
docker-compose --env-file .env.prod up -d

# Run on different port
# Edit docker-compose.yml ports: "8080:3001"

# Background deployment with restart policy
docker-compose up -d --restart unless-stopped
```

### Export/Import for Sharing
```bash
# Export application
tar -czf newsbot-app.tar.gz .

# On new system:
tar -xzf newsbot-app.tar.gz
cd new-newsbot-js
# Configure .env file
docker-compose up -d
```

## 🎁 Complete Application Package

Your NewsBot is now **fully containerized and portable!** Here's what has been created:

### ✅ **Complete Docker Setup**
- **Dockerfile** - Optimized container with Node.js 18, TensorFlow dependencies, and health checks
- **docker-compose.yml** - Easy deployment with environment variables and data persistence  
- **.dockerignore** - Optimized build excluding unnecessary files
- **.env.example** - Template for all configuration options

### ✅ **Key Features**
- **Data Persistence** - Configuration and cache data survives container restarts
- **Health Monitoring** - Built-in health checks for the web GUI
- **Environment Variables** - Easy configuration without code changes
- **Resource Management** - Memory and CPU limits configurable
- **Auto-restart** - Container restarts automatically if it crashes

## 📦 How to Share Your Application

### **For the Current User (Export):**
```bash
# Create a complete package (excludes node_modules to save space)
tar -czf newsbot-app.tar.gz --exclude=node_modules .

# Send newsbot-app.tar.gz to anyone who needs to run the bot
```

### **For the Recipient (Import and Deploy):**

#### Step 1: Extract and Setup
```bash
# Extract the application
tar -xzf newsbot-app.tar.gz
cd new-newsbot-js

# Create configuration from template
cp .env.example .env
```

#### Step 2: Create Discord Bot
1. Go to https://discord.com/developers/applications
2. Click "New Application" and give it a name
3. Go to "Bot" section and click "Add Bot"
4. Copy the bot token (keep it secret!)
5. Enable these bot permissions:
   - Send Messages
   - Read Message History
   - Embed Links
6. Invite bot to your Discord server using the OAuth2 URL generator

#### Step 3: Configure Environment
Edit the `.env` file with required settings:
```env
# Required - Get this from Discord Developer Portal
DISCORD_BOT_TOKEN=your_discord_bot_token_here

# Optional - Discord channels (right-click channel > Copy ID)
TEST_CHANNEL=your_test_channel_id
GO_CHANNEL=your_main_channel_id

# Optional - API keys for additional news sources
CONGRESS_GOV_TOKEN=your_congress_token
NASA_TOKEN=your_nasa_token
MARKETAUX_TOKEN=your_marketaux_token

# Optional - Bot behavior  
ENABLED_ENDPOINTS=reddit,congress,marketaux,thenewsapi
VECTOR_EMBEDDING=true
LOG_LEVEL=info
```

> **Note:** To get Discord channel IDs, enable Developer Mode in Discord settings, then right-click any channel and select "Copy ID"

#### Step 4: Deploy
```bash
# Start the bot (will automatically build the Docker image)
docker-compose up -d

# View logs to confirm it's working
docker-compose logs -f

# Access web control panel
# Open browser to: http://localhost:3001
```

### **Ongoing Management Commands:**
```bash
# View bot status
docker-compose ps

# View live logs
docker-compose logs -f newsbot

# Restart the bot
docker-compose restart

# Stop the bot
docker-compose down

# Update and restart (if you receive updates)
git pull
docker-compose build --no-cache
docker-compose up -d

# Complete reset (removes all data - be careful!)
docker-compose down -v
```

## 🌍 System Requirements

### **Minimum Requirements:**
- Docker and Docker Compose installed
- 2GB RAM (for TensorFlow AI features)
- 5GB disk space
- Internet connection

### **Supported Platforms:**
- ✅ Linux (Ubuntu, CentOS, Debian, etc.)
- ✅ macOS (Intel and Apple Silicon)
- ✅ Windows 10/11 with WSL2
- ✅ Cloud platforms (AWS, Google Cloud, Azure, DigitalOcean)

## 🔄 Application Updates

### **Receiving Updates:**
If you receive an updated version:
```bash
# Stop current version
docker-compose down

# Extract new version (backup your .env first!)
cp .env .env.backup
tar -xzf newsbot-app-updated.tar.gz
cp .env.backup .env

# Start updated version
docker-compose up -d --build
```

### **Data Preservation:**
Your bot's data is automatically preserved between updates:
- Discord channel configurations
- Reddit source lists
- Seen article cache
- API usage counters
- Vector embedding cache

## ⚡ Quick Reference

### **Essential Commands:**
```bash
# Start bot
docker-compose up -d

# View logs
docker-compose logs -f

# Stop bot
docker-compose down

# Restart bot
docker-compose restart

# Web GUI
http://localhost:3001
```

### **File Structure:**
- `.env` - Your configuration (copy from .env.example)
- `data/` - Persistent bot data (auto-created)
- `docker-compose.yml` - Deployment configuration
- `Dockerfile` - Container definition

### **Support:**
- 📊 Web GUI: http://localhost:3001
- 📋 Logs: `docker-compose logs -f`
- 🔧 Health: `docker-compose ps`
- 📚 Docs: This README

## 📝 License

ISC License - see package.json for details.