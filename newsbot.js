require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { getRandomEndpoint } = require('./helpers');
const interval_in_minutes = 1.25;
const url = 'http://localhost:3000';

// Initialize the bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Bot is ready
const isTesting = false; // Set this to `false` when not testing

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

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

                if (isTesting) {
                    // If testing, only send to the test channel
                    const testChannel = client.channels.cache.get(process.env.TEST_CHANNEL); // Replace with your test channel ID
                    if (testChannel) {
                        testChannel.send(messageContent).catch(err => console.error(`Error sending message to test channel:`, err));
                    }
                } else {
                    // If not testing, send to all guilds
                    client.guilds.cache.forEach(guild => {
                        // Find a text channel to send the message to
                        const channel = guild.channels.cache.find(ch => ch.type === 'text' && ch.permissionsFor(client.user).has('SEND_MESSAGES'));
                        if (channel) {
                            channel.send(messageContent).catch(err => console.error(`Error sending message in guild ${guild.name}:`, err));
                        }
                    });
                }
            })
            .catch(err => console.error('Error fetching data:', err));
        }
    }, interval_in_minutes* 60 * 1000); // Adjust interval time here (currently set to 1 minute)
});




// Respond to messages
client.on('messageCreate', (message) => {
    if (message.content === '!ping') {
        message.reply('Pong!');
    }
});

// Log in with your bot token
client.login(process.env.DISCORD_BOT_TOKEN);
