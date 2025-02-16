const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); 
const Reddit = require('./endpoint_logic/reddit_source_handling.js');
require('dotenv').config();

const app = express();

//endpoint logic
const reddit = new Reddit();

app.post('/reddit', async (req, res, next) => {
    try {
        const randomSource = reddit.getRandomSource();
        if (!randomSource) {
            console.log('No sources available.');
            return res.status(400).json({ error: 'No sources available' });
        }
        
        const latestPost = await reddit.getLatestPostFromAnySource();

        if (latestPost) {
            console.log(`Latest Post: ${latestPost.title}`);
            console.log(`URL: ${latestPost.url}`);
            return res.json({
                title: latestPost.title, 
                url: latestPost.url
            });
        } else {
            console.log('No new posts found.');
            return res.status(404).json({ error: 'No new posts found' });
        }
    } catch (error) {
        console.error('Error occurred:', error);
        return res.status(500).json({ error: error.message });
    }
});

app.post('/congress', async (req, res, next) => {
//TODO: add logic for congress api call for latest bills
//the API returns like 250 bills or something, so it isnt as dynamic as the other sources
});



app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000'); 
  });
  