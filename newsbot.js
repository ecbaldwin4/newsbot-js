require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const { getRandomEndpoint } = require('./helpers');
const interval_in_minutes = 1.25;
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

// Read target channels from the CSV file at the start
function loadTargetChannels() {
    try {
        const data = fs.readFileSync(targetChannelsFile, 'utf8');
        const lines = data.split('\n');
        targetChannels = lines.map(line => {
            const [guildId, channelId] = line.split(',');
            return { guildId, channelId };
        });
        console.log('Loaded target channels:', targetChannels);
    } catch (error) {
        console.error('Error loading target channels:', error);
    }
}

// Save target channels to CSV file
function saveTargetChannels() {
    const data = targetChannels.map(entry => `${entry.guildId},${entry.channelId}`).join('\n');
    fs.writeFileSync(targetChannelsFile, data, 'utf8');
}

// Bot is ready
const isTesting = false; // Set this to `false` when not testing

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

                // Send message to each target channel
                targetChannels.forEach(({ guildId, channelId }) => {
                    const guild = client.guilds.cache.get(guildId);
                    if (guild) {
                        const channel = guild.channels.cache.get(channelId);
                        if (channel && channel.permissionsFor(client.user).has('SEND_MESSAGES')) {
                            channel.send(messageContent).catch(err => console.error(`Error sending message in guild ${guild.name}:`, err));
                        }
                    }
                });
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

    // Handle !setchannel command to add a target channel
    if (message.content.startsWith('!setchannel')) {
        const [command, channelId] = message.content.split(' ');

        if (channelId && message.guild && message.guild.id) {
            // Check if the channel exists and is valid
            const channel = message.guild.channels.cache.get(channelId);
            if (channel && channel.isText()) {
                // Add to target channels
                targetChannels.push({
                    guildId: message.guild.id,
                    channelId: channel.id
                });
                // Save to CSV
                saveTargetChannels();
                message.reply(`This channel is now registered for automatic posts.`);
            } else {
                message.reply('Invalid channel ID. Please provide a valid text channel ID.');
            }
        } else {
            message.reply('Please provide a channel ID after the command.');
        }
    }
});

// Log in with your bot token
client.login(process.env.DISCORD_BOT_TOKEN);
