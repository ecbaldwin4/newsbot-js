const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); 
const Reddit = require('./endpoint_logic/reddit_source_handling.js');

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
                title: latestPost.title, //this logic may not work for all endpoints, but we will see...
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



app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000'); 
  });
  