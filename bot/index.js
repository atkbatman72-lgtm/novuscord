const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const app = express();
app.use(express.json());

const verifiedUsers = new Map();

client.on('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}`);
});

// OAuth2 callback endpoint
app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code provided');

    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.REDIRECT_URI
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const { access_token } = tokenResponse.data;
        
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const user = userResponse.data;
        verifiedUsers.set(user.id, { access_token, verified: true, timestamp: Date.now() });

        res.send(`<html><body><h1>Verified!</h1><p>You can close this window.</p></body></html>`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Verification failed');
    }
});

// API to pull member into server
app.post('/api/pull', async (req, res) => {
    const { userId, guildId, apiKey } = req.body;

    if (apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    const userData = verifiedUsers.get(userId);
    if (!userData) {
        return res.status(404).json({ error: 'User not verified' });
    }

    try {
        await axios.put(
            `https://discord.com/api/guilds/${guildId}/members/${userId}`,
            { access_token: userData.access_token },
            { headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` } }
        );

        res.json({ success: true, message: 'Member pulled successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to pull member', details: error.response?.data });
    }
});

// Bulk pull endpoint
app.post('/api/pull-bulk', async (req, res) => {
    const { userIds, guildId, apiKey } = req.body;

    if (apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    const results = [];
    for (const userId of userIds) {
        const userData = verifiedUsers.get(userId);
        if (!userData) {
            results.push({ userId, success: false, error: 'Not verified' });
            continue;
        }

        try {
            await axios.put(
                `https://discord.com/api/guilds/${guildId}/members/${userId}`,
                { access_token: userData.access_token },
                { headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` } }
            );
            results.push({ userId, success: true });
        } catch (error) {
            results.push({ userId, success: false, error: error.response?.data });
        }
    }

    res.json({ results });
});

client.login(process.env.BOT_TOKEN);
app.listen(process.env.PORT || 3000, () => {
    console.log(`API running on port ${process.env.PORT || 3000}`);
});
