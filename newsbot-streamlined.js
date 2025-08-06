require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class NewsBotStreamlined {
    constructor() {
        this.interval_in_minutes = 1.25;
        this.isTesting = false;
        this.targetChannels = [];
        this.seenPostIds = {};
        this.sources = {};
        this.bannedKeywords = [];
        
        this.secretMessage = process.env.secret_message?.replace(/^"|"$/g, '') || '';
        this.secretReply = process.env.secret_reply?.replace(/^"|"$/g, '') || '';
        
        if (this.isTesting) {
            this.interval_in_minutes = 0.1;
        }

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        this.initializeDataDirectories();
        this.loadAllData();
        this.setupDiscordHandlers();
    }

    initializeDataDirectories() {
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const requiredFiles = [
            'target_channels.csv',
            'reddit_seen_post_ids.csv',
            'reddit_sources.csv',
            'banned_keywords.csv',
            'endpoint_selector.csv'
        ];

        requiredFiles.forEach(file => {
            const filePath = path.join(dataDir, file);
            if (!fs.existsSync(filePath)) {
                if (file === 'reddit_sources.csv') {
                    fs.writeFileSync(filePath, 'author,json_url\nany,https://www.reddit.com/r/news/new.json\n', 'utf8');
                } else if (file === 'endpoint_selector.csv') {
                    fs.writeFileSync(filePath, '/reddit\n', 'utf8');
                } else {
                    fs.writeFileSync(filePath, '', 'utf8');
                }
            }
        });
    }

    loadAllData() {
        this.loadTargetChannels();
        this.loadSeenPostIds();
        this.loadSources();
        this.loadBannedKeywords();
    }

    loadTargetChannels() {
        try {
            const data = fs.readFileSync(path.join(__dirname, 'data', 'target_channels.csv'), 'utf8');
            this.targetChannels = data.split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .map(channelId => ({ channelId }));
            console.log('Loaded target channels:', this.targetChannels.length);
        } catch (error) {
            console.error('Error loading target channels:', error);
            this.targetChannels = [];
        }
    }

    saveTargetChannels() {
        try {
            const data = this.targetChannels.map(entry => entry.channelId).join('\n');
            fs.writeFileSync(path.join(__dirname, 'data', 'target_channels.csv'), data, 'utf8');
        } catch (error) {
            console.error('Error saving target channels:', error);
        }
    }

    loadSeenPostIds() {
        try {
            const data = fs.readFileSync(path.join(__dirname, 'data', 'reddit_seen_post_ids.csv'), 'utf8');
            this.seenPostIds = {};
            data.split('\n').forEach(line => {
                const [postId, timestamp] = line.split(',');
                if (postId && timestamp) {
                    this.seenPostIds[postId] = parseFloat(timestamp);
                }
            });
            console.log('Loaded seen post IDs:', Object.keys(this.seenPostIds).length);
        } catch (error) {
            console.error('Error loading seen post IDs:', error);
            this.seenPostIds = {};
        }
    }

    saveSeenPostIds() {
        try {
            const currentTime = Date.now() / 1000;
            const validEntries = Object.entries(this.seenPostIds)
                .filter(([_, timestamp]) => currentTime - timestamp < 86400)
                .map(([postId, timestamp]) => `${postId},${timestamp}`)
                .join('\n');
            fs.writeFileSync(path.join(__dirname, 'data', 'reddit_seen_post_ids.csv'), validEntries, 'utf8');
        } catch (error) {
            console.error('Error saving seen post IDs:', error);
        }
    }

    loadSources() {
        try {
            const data = fs.readFileSync(path.join(__dirname, 'data', 'reddit_sources.csv'), 'utf8');
            this.sources = {};
            data.split('\n').slice(1).forEach(line => {
                const [author, jsonUrl] = line.split(',');
                if (author && jsonUrl) {
                    this.sources[jsonUrl] = author;
                }
            });
            console.log('Loaded sources:', Object.keys(this.sources).length);
        } catch (error) {
            console.error('Error loading sources:', error);
            this.sources = {};
        }
    }

    loadBannedKeywords() {
        try {
            const data = fs.readFileSync(path.join(__dirname, 'data', 'banned_keywords.csv'), 'utf8');
            this.bannedKeywords = [];
            data.split('\n').forEach(line => {
                line.split(',').forEach(keyword => {
                    if (keyword.trim()) {
                        this.bannedKeywords.push(keyword.trim());
                    }
                });
            });
            console.log('Loaded banned keywords:', this.bannedKeywords.length);
        } catch (error) {
            console.error('Error loading banned keywords:', error);
            this.bannedKeywords = [];
        }
    }

    getRandomEndpoint() {
        try {
            const data = fs.readFileSync(path.join(__dirname, 'data', 'endpoint_selector.csv'), 'utf8');
            const endpoints = data.split('\n').map(line => line.trim()).filter(Boolean);
            if (endpoints.length === 0) return '/reddit';
            return endpoints[Math.floor(Math.random() * endpoints.length)];
        } catch (error) {
            console.error('Error reading endpoint selector:', error);
            return '/reddit';
        }
    }

    async fetchHazardousAsteroids() {
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

            const hazardousAsteroids = [];
            for (const date in response.data.near_earth_objects) {
                for (const asteroid of response.data.near_earth_objects[date]) {
                    if (asteroid.is_potentially_hazardous_asteroid) {
                        const approachDate = new Date(asteroid.close_approach_data[0].close_approach_date_full);
                        if (approachDate >= new Date()) {
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

    async getLatestRedditPost() {
        const shuffledSources = Object.entries(this.sources).sort(() => 0.5 - Math.random());
        
        for (const [jsonUrl, author] of shuffledSources) {
            const post = await this.fetchPostFromSource(jsonUrl, author);
            if (post) return post;
        }
        return null;
    }

    async fetchPostFromSource(jsonUrl, author) {
        const thresholdTimestamp = Math.floor(Date.now() / 1000) - 86400;
        
        try {
            const response = await axios.get(jsonUrl, { 
                headers: { 'User-Agent': 'news_feed_monitor' },
                timeout: 10000
            });
            
            const posts = response.data?.data?.children || [];
            
            for (const post of posts) {
                const { id: postId, title, created_utc: createdUtc, author: postAuthor } = post.data;
                const url = post.data.url_overridden_by_dest || post.data.url || '';
                
                if (createdUtc < thresholdTimestamp) continue;
                if (author !== 'any' && postAuthor !== author) continue;
                if (!url || this.isUrlBanned(url)) {
                    this.markPostAsSeen(postId);
                    continue;
                }
                if (this.hasSeenPost(postId)) continue;
                
                this.markPostAsSeen(postId);
                return { title, url };
            }
        } catch (error) {
            console.error(`Error fetching from ${jsonUrl}:`, error.message);
        }
        return null;
    }

    isUrlBanned(url) {
        return this.bannedKeywords.some(keyword => 
            url.toLowerCase().includes(keyword.toLowerCase())
        );
    }

    hasSeenPost(postId) {
        return postId in this.seenPostIds;
    }

    markPostAsSeen(postId) {
        this.seenPostIds[postId] = Date.now() / 1000;
        this.saveSeenPostIds();
    }

    async handleEndpoint(endpoint) {
        console.log(`Processing endpoint: ${endpoint}`);
        
        switch (endpoint) {
            case '/reddit':
                return await this.getLatestRedditPost();
            default:
                console.error(`Unknown endpoint: ${endpoint}`);
                return null;
        }
    }

    async sendToChannels(messageContent) {
        if (this.isTesting) {
            const testChannelId = process.env.TEST_CHANNEL;
            if (testChannelId) {
                const testChannel = this.client.channels.cache.get(testChannelId);
                if (testChannel) {
                    console.log(`Sending to test channel: ${testChannel.name}`);
                    await testChannel.send(messageContent).catch(console.error);
                }
            }
        } else {
            for (const { channelId } of this.targetChannels) {
                const channel = this.client.channels.cache.get(channelId);
                if (channel) {
                    console.log(`Sending to channel: ${channel.name}`);
                    await channel.send(messageContent).catch(console.error);
                } else {
                    console.error(`Channel not found: ${channelId}`);
                }
            }
        }
    }

    setupDiscordHandlers() {
        this.client.once('ready', () => {
            console.log(`✅ ${this.client.user.tag} is ready!`);
            this.startNewsLoop();
        });

        this.client.on('messageCreate', async (message) => {
            await this.handleMessage(message);
        });
    }

    async handleMessage(message) {
        if (message.content === '!ping') {
            await message.reply('Pong!');
            return;
        }

        if (message.content === '!setchannel') {
            if (message.guild && message.channel && message.channel.type === 0) {
                this.targetChannels.push({ channelId: message.channel.id });
                this.saveTargetChannels();
                await message.reply(`Channel #${message.channel.name} registered for automatic posts.`);
            } else {
                await message.reply('This command must be used in a text channel.');
            }
            return;
        }

        if (message.content === '!asteroids') {
            const asteroids = await this.fetchHazardousAsteroids();
            if (asteroids.length > 0) {
                await message.channel.send("The following asteroids are approaching Earth and have been labeled Potentially Hazardous by NASA.");
                for (const asteroid of asteroids) {
                    const messageContent = `**Name**: ${asteroid.name}
**NASA URL**: ${asteroid.nasa_jpl_url}
**Estimated Diameter (max)**: ${asteroid.estimated_diameter.miles.estimated_diameter_max} miles
**Close Approach Date**: ${asteroid.close_approach_data[0].close_approach_date_full}
**Relative Velocity**: ${asteroid.close_approach_data[0].relative_velocity.miles_per_hour} mph
**Miss Distance**: ${asteroid.close_approach_data[0].miss_distance.miles} miles`;
                    await message.channel.send(messageContent);
                }
            } else {
                await message.channel.send("No potentially hazardous asteroids found...for now.");
            }
            return;
        }

        if (message.author.id === this.client.user.id) {
            const keywords = ["maryland", "baltimore", "wes moore"];
            const content = message.content.toLowerCase();
            if (keywords.some(keyword => content.includes(keyword))) {
                const targetChannel = this.client.channels.cache.get(process.env.GO_CHANNEL);
                if (targetChannel && process.env.TYTANIC) {
                    await targetChannel.send(process.env.TYTANIC);
                }
            }
            return;
        }

        if (message.author.id !== this.client.user.id && 
            this.secretMessage && 
            message.content.toLowerCase().includes(this.secretMessage.toLowerCase())) {
            await message.channel.send(this.secretReply);
            await message.react("🇨🇦");
        }
    }

    startNewsLoop() {
        setInterval(async () => {
            try {
                const selectedEndpoint = this.getRandomEndpoint();
                const data = await this.handleEndpoint(selectedEndpoint);
                
                if (data && data.title && data.url) {
                    const messageContent = `Title: ${data.title}\nURL: ${data.url}`;
                    await this.sendToChannels(messageContent);
                    console.log(`✅ Sent news: ${data.title.substring(0, 50)}...`);
                } else {
                    console.log('❌ No new posts found');
                }
            } catch (error) {
                console.error('❌ Error in news loop:', error);
            }
        }, this.interval_in_minutes * 60 * 1000);
        
        console.log(`🔄 News loop started (${this.interval_in_minutes} minutes interval)`);
    }

    async start() {
        try {
            console.log('🚀 Starting NewsBot...');
            await this.client.login(process.env.DISCORD_BOT_TOKEN);
        } catch (error) {
            console.error('❌ Failed to start bot:', error);
            process.exit(1);
        }
    }
}

if (require.main === module) {
    const bot = new NewsBotStreamlined();
    bot.start();
}

module.exports = NewsBotStreamlined;