import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import { google } from 'googleapis';
import { Octokit } from '@octokit/rest';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// OAuth2 clients
const googleOAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.OAUTH_REDIRECT_BASE_URL}/api/auth/google/callback`
);

const githubScopes = ['repo', 'read:user'];
const googleScopes = [
  'https://www.googleapis.com/auth/calendar.readonly'
];

// Endpoint to generate ephemeral tokens
app.post('/api/generate-token', async (req, res) => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY not configured in environment variables'
    });
  }

  try {
    console.log('🔄 Generating new ephemeral token...');

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-realtime'
        }
      })
    });

    const data = await response.json();

    if (response.ok && data.value) {
      console.log('✅ Ephemeral token generated successfully');
      res.json({
        token: data.value,
        expires_at: data.expires_at || 'Unknown'
      });
    } else {
      console.error('❌ Failed to generate token:', data);
      res.status(400).json({
        error: 'Failed to generate ephemeral token',
        details: data
      });
    }
  } catch (error) {
    console.error('❌ Network error:', error.message);
    res.status(500).json({
      error: 'Network error while generating token',
      details: error.message
    });
  }
});

// Google OAuth endpoints
app.get('/api/auth/google', (req, res) => {
  const authUrl = googleOAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: googleScopes,
    prompt: 'consent'
  });
  res.json({ authUrl });
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const { tokens } = await googleOAuth2Client.getToken(code);
    req.session.googleTokens = tokens;

    res.send(`
      <html>
        <body>
          <h2>Google Calendar Connected!</h2>
          <p>You can close this window and return to the app.</p>
          <script>
            window.opener?.postMessage({ type: 'google-auth-success' }, 'http://localhost:5173');
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).send('Authentication failed');
  }
});

// GitHub OAuth endpoints
app.get('/api/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = `${process.env.OAUTH_REDIRECT_BASE_URL}/api/auth/github/callback`;
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${githubScopes.join(',')}`;
  res.json({ authUrl });
});

app.get('/api/auth/github/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code
      })
    });

    const data = await tokenResponse.json();

    if (data.access_token) {
      req.session.githubToken = data.access_token;

      res.send(`
        <html>
          <body>
            <h2>GitHub Connected!</h2>
            <p>You can close this window and return to the app.</p>
            <script>
              window.opener?.postMessage({ type: 'github-auth-success' }, 'http://localhost:5173');
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `);
    } else {
      throw new Error('Failed to get access token');
    }
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    res.status(500).send('Authentication failed');
  }
});

// Sync endpoints
app.post('/api/sync/google-calendar', async (req, res) => {
  const tokens = req.session.googleTokens;

  if (!tokens) {
    return res.status(401).json({ error: 'Not authenticated with Google Calendar' });
  }

  try {
    googleOAuth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: googleOAuth2Client });

    const now = new Date();
    const startOfWeek = new Date(now);
    const currentDay = startOfWeek.getDay();
    const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
    startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfWeek.toISOString(),
      timeMax: endOfWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    req.session.googleCalendarData = {
      events: response.data.items,
      syncedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      eventCount: response.data.items?.length || 0,
      syncedAt: req.session.googleCalendarData.syncedAt
    });
  } catch (error) {
    console.error('Google Calendar sync error:', error);
    res.status(500).json({ error: 'Failed to sync Google Calendar' });
  }
});

app.post('/api/sync/github', async (req, res) => {
  const token = req.session.githubToken;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated with GitHub' });
  }

  try {
    const octokit = new Octokit({ auth: token });

    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const user = await octokit.rest.users.getAuthenticated();
    const username = user.data.login;

    // Get recent events (commits, PRs, etc.)
    const events = await octokit.rest.activity.listEventsForAuthenticatedUser({
      username,
      per_page: 100
    });

    // Filter events from the last week
    const weekEvents = events.data.filter(event => {
      const eventDate = new Date(event.created_at);
      return eventDate >= oneWeekAgo;
    });

    // Get repositories
    const repos = await octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 10
    });

    req.session.githubData = {
      username,
      events: weekEvents,
      repos: repos.data,
      syncedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      username,
      eventCount: weekEvents.length,
      syncedAt: req.session.githubData.syncedAt
    });
  } catch (error) {
    console.error('GitHub sync error:', error);
    res.status(500).json({ error: 'Failed to sync GitHub' });
  }
});

// Get snapshot data
app.get('/api/snapshot/google-calendar', async (req, res) => {
  const data = req.session.googleCalendarData;

  if (!data) {
    return res.status(404).json({ error: 'No Google Calendar data available. Please sync first.' });
  }

  res.json(data);
});

app.get('/api/snapshot/github', async (req, res) => {
  const data = req.session.githubData;

  if (!data) {
    return res.status(404).json({ error: 'No GitHub data available. Please sync first.' });
  }

  res.json(data);
});

// Check authentication status
app.get('/api/auth/status', (req, res) => {
  res.json({
    google: !!req.session.googleTokens,
    github: !!req.session.githubToken
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Token generation server is running',
    hasApiKey: !!process.env.OPENAI_API_KEY
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Token generation server running on http://localhost:${PORT}`);
  console.log(`📝 API Key configured: ${process.env.OPENAI_API_KEY ? '✅ Yes' : '❌ No'}`);
});