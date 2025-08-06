const { Client, GatewayIntentBits } = require('discord.js');
const { EventEmitter } = require('events');

class DiscordService extends EventEmitter {
    constructor(config, dataManager, logger) {
        super();
        this.config = config;
        this.dataManager = dataManager;
        this.logger = logger;
        this.discordConfig = config.getDiscordConfig();
        this.secretsConfig = config.getSecretsConfig();
        
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        this.targetChannels = [];
        this.isReady = false;
        
        this.setupEventHandlers();
    }

    async initialize() {
        this.logger.info('Initializing Discord service...');
        await this.loadTargetChannels();
        await this.login();
    }

    async login() {
        try {
            await this.client.login(this.discordConfig.token);
        } catch (error) {
            this.logger.error('Failed to login to Discord', error);
            throw error;
        }
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            this.isReady = true;
            this.logger.success(`Discord bot ready as ${this.client.user.tag}`);
            this.emit('ready');
        });

        this.client.on('messageCreate', async (message) => {
            try {
                await this.handleMessage(message);
            } catch (error) {
                this.logger.error('Error handling Discord message', error);
                // Continue operating - don't let one message crash the bot
            }
        });

        this.client.on('error', (error) => {
            this.logger.error('Discord client error', error);
            this.emit('error', error);
        });

        this.client.on('disconnect', () => {
            this.isReady = false;
            this.logger.warn('Discord bot disconnected');
            this.emit('disconnect');
        });
    }

    async handleMessage(message) {
        try {
            // Skip bot messages (except our own for keyword checking)
            if (message.author.bot && message.author.id !== this.client.user.id) {
                return;
            }

            // Skip messages without text content (GIFs, images, embeds, etc.)
            if (!message.content || message.content.trim() === '') {
                return;
            }

            // Handle ping command
            if (message.content === '!ping') {
                await message.reply('Pong!');
                return;
            }

            // Handle set channel command
            if (message.content === '!setchannel') {
                await this.handleSetChannel(message);
                return;
            }

            // Handle asteroid command  
            if (message.content === '!asteroids') {
                this.emit('asteroidRequest', message);
                return;
            }

            // Handle congress command
            if (message.content === '!congress') {
                this.emit('congressRequest', message);
                return;
            }

            // Handle bot's own messages for keyword checking
            if (message.author.id === this.client.user.id) {
                await this.handleBotMessage(message);
                return;
            }

            // Handle secret message (only for text messages)
            if (message.author.id !== this.client.user.id && this.secretsConfig.message) {
                await this.handleSecretMessage(message);
            }

        } catch (error) {
            this.logger.error('Error in handleMessage', error);
            // Don't re-throw - we want the bot to continue running
        }
    }

    async handleSetChannel(message) {
        if (message.guild && message.channel && message.channel.type === 0) {
            // Check if channel is already registered
            if (this.targetChannels.some(ch => ch.channelId === message.channel.id)) {
                await message.reply('This channel is already registered for automatic posts.');
                return;
            }

            this.targetChannels.push({ channelId: message.channel.id });
            this.saveTargetChannels();
            await message.reply(`Channel #${message.channel.name} registered for automatic posts.`);
            this.logger.info(`Channel registered: #${message.channel.name} (${message.channel.id})`);
        } else {
            await message.reply('This command must be used in a text channel.');
        }
    }

    async handleBotMessage(message) {
        const keywords = ["maryland", "baltimore", "wes moore"];
        const content = message.content.toLowerCase();
        
        if (keywords.some(keyword => content.includes(keyword))) {
            const targetChannel = this.client.channels.cache.get(this.discordConfig.goChannel);
            if (targetChannel && this.discordConfig.tytanic) {
                try {
                    await targetChannel.send(this.discordConfig.tytanic);
                } catch (error) {
                    this.logger.error('Error sending tytanic message', error);
                }
            }
        }
    }

    async handleSecretMessage(message) {
        try {
            // Ensure both message content and secret message exist and are strings
            if (!this.secretsConfig.message || 
                !message.content || 
                typeof message.content !== 'string' ||
                typeof this.secretsConfig.message !== 'string') {
                return;
            }

            if (message.content.toLowerCase().includes(this.secretsConfig.message.toLowerCase())) {
                if (this.secretsConfig.reply) {
                    await message.channel.send(this.secretsConfig.reply);
                }
                await message.react("🇨🇦");
            }
        } catch (error) {
            this.logger.error('Error handling secret message', error);
            // Don't re-throw - continue operation
        }
    }

    async sendToChannels(messageContent) {
        if (!this.isReady) {
            this.logger.warn('Discord bot not ready, cannot send message');
            return false;
        }

        const channels = this.config.isTesting() ? this.getTestChannels() : this.targetChannels;
        
        if (channels.length === 0) {
            this.logger.warn('No target channels configured');
            return false;
        }

        let successCount = 0;
        for (const { channelId } of channels) {
            try {
                const channel = this.client.channels.cache.get(channelId);
                if (channel) {
                    await channel.send(messageContent);
                    successCount++;
                    this.logger.debug(`Message sent to #${channel.name}`);
                } else {
                    this.logger.warn(`Channel not found: ${channelId}`);
                }
            } catch (error) {
                this.logger.error(`Error sending message to channel ${channelId}`, error);
            }
        }

        this.logger.info(`Message sent to ${successCount}/${channels.length} channels`);
        return successCount > 0;
    }

    async sendToChannel(channelId, messageContent) {
        if (!this.isReady) {
            return false;
        }

        try {
            const channel = this.client.channels.cache.get(channelId);
            if (channel) {
                await channel.send(messageContent);
                return true;
            } else {
                this.logger.warn(`Channel not found: ${channelId}`);
                return false;
            }
        } catch (error) {
            this.logger.error(`Error sending message to channel ${channelId}`, error);
            return false;
        }
    }

    getTestChannels() {
        if (this.discordConfig.testChannel) {
            return [{ channelId: this.discordConfig.testChannel }];
        }
        return [];
    }

    async loadTargetChannels() {
        this.dataManager.ensureFile('target_channels.csv', '');
        
        const channels = this.dataManager.loadCSVData('target_channels.csv', line => {
            const channelId = line.trim();
            return channelId ? { channelId } : null;
        });

        this.targetChannels = channels;
        this.logger.info(`Loaded ${this.targetChannels.length} target channels`);
    }

    saveTargetChannels() {
        const data = this.targetChannels.map(entry => entry.channelId);
        this.dataManager.saveCSVData('target_channels.csv', data);
    }

    getTargetChannels() {
        return [...this.targetChannels];
    }

    addTargetChannel(channelId) {
        if (!this.targetChannels.some(ch => ch.channelId === channelId)) {
            this.targetChannels.push({ channelId });
            this.saveTargetChannels();
            return true;
        }
        return false;
    }

    removeTargetChannel(channelId) {
        const index = this.targetChannels.findIndex(ch => ch.channelId === channelId);
        if (index > -1) {
            this.targetChannels.splice(index, 1);
            this.saveTargetChannels();
            return true;
        }
        return false;
    }

    isConnected() {
        return this.isReady && this.client.readyAt !== null;
    }

    getUserTag() {
        return this.client.user?.tag || 'Unknown';
    }

    async shutdown() {
        this.logger.info('Shutting down Discord service...');
        if (this.client) {
            await this.client.destroy();
        }
        this.emit('shutdown');
    }
}

module.exports = DiscordService;