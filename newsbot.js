require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const { getRandomEndpoint } = require('./helpers');
const interval_in_minutes = 0.5;
const url = process.env.ENDPOINT_URL;
const targetChannelsFile = './data/target_channels.csv';

// Initialize the bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let targetChannels = [];
const isTesting = false; // Set to `true` to only send to the test channel

// Read target channels from the CSV file at the start
function loadTargetChannels() {
    try {
        const data = fs.readFileSync(targetChannelsFile, 'utf8');
        const lines = data.split('\n');
        targetChannels = lines.map(line => {
            const channelId = line.trim(); // Only keep the channelId, no guildId
            return { channelId };
        });
        console.log('Loaded target channels:', targetChannels);
    } catch (error) {
        console.error('Error loading target channels:', error);
    }
}

// Save target channels to CSV file (only channelId)
function saveTargetChannels() {
    const data = targetChannels.map(entry => entry.channelId).join('\n');
    fs.writeFileSync(targetChannelsFile, data, 'utf8');
}

// Bot is ready
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Load target channels when bot is ready
    loadTargetChannels();

    // Run task every X minutes
    setInterval(() => {
        const selectedEndpoint = getRandomEndpoint();
        if (selectedEndpoint) {
            console.log(`Selected endpoint: ${selectedEndpoint}`);
            fetch(url + selectedEndpoint, {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                // Format the message
                const messageContent = `Title: ${data.title}\nURL: ${data.url}`;

                // Test functionality: send to test channel only when isTesting is true
                if (isTesting) {
                    const testChannelId = process.env.TEST_CHANNEL; // Ensure this environment variable is set
                    if (testChannelId) {
                        const testChannel = client.channels.cache.get(testChannelId);
                        if (testChannel) {
                            console.log(`Sending message to test channel: ${testChannel.name}`);
                            testChannel.send(messageContent).catch(err => console.error(`Error sending message to test channel:`, err));
                        } else {
                            console.error(`Test channel not found with ID: ${testChannelId}`);
                        }
                    } else {
                        console.error('TEST_CHANNEL environment variable is not set.');
                    }
                } else {
                    // Send message to each target channel using channelId only
                    targetChannels.forEach(({ channelId }) => {
                        const channel = client.channels.cache.get(channelId);
                        if (channel) {
                            console.log(`Found channel: ${channel.name} (${channel.id})`);
                            channel.send(messageContent).catch(err => console.error(`Error sending message to channel ${channel.name}:`, err));
                        } else {
                            console.error(`Channel not found: ${channelId}`);
                        }
                    });
                }
            })
            .catch(err => console.error('Error fetching data:', err));
        }
    }, interval_in_minutes * 60 * 1000); // Adjust interval time here
});

// Respond to messages
client.on('messageCreate', (message) => {
    if (message.content === '!ping') {
        message.reply('Pong!');
    }

    // Handle !setchannel command to add the current channel as a target channel
    if (message.content === '!setchannel') {
        if (message.guild && message.channel && message.channel.isText()) {
            // Add the current channel to the target channels (only store channelId)
            targetChannels.push({
                channelId: message.channel.id
            });
            // Save to CSV and update in-memory list
            saveTargetChannels();
            message.reply(`This channel (#${message.channel.name}) is now registered for automatic posts.`);
        } else {
            message.reply('This command must be used in a text channel.');
        }
    }
});

// Log in with your bot token
client.login(process.env.DISCORD_BOT_TOKEN);
