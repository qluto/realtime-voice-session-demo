# Integration Setup Guide

This guide explains how to set up Google Calendar and GitHub integrations for the Weekly Reflection Coaching application.

## Overview

The application now supports real-time integration with:
- **Google Calendar** - Fetch and analyze your weekly calendar events
- **GitHub** - Gather your development activity (commits, PRs, reviews)

## Prerequisites

Before setting up integrations, ensure you have:
1. A Google account with access to Google Cloud Console
2. A GitHub account
3. Your `.env` file configured with the required credentials

## Google Calendar Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Calendar API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

### 2. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client ID"
3. Configure the OAuth consent screen:
   - User Type: External (or Internal for Google Workspace)
   - Fill in required fields (App name, user support email, developer contact)
   - Add scopes: `https://www.googleapis.com/auth/calendar.readonly`
4. Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:3001/api/auth/google/callback`
5. Copy the **Client ID** and **Client Secret**

### 3. Update `.env` File

Add the credentials to your `.env` file:

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## GitHub Setup

### 1. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the application details:
   - Application name: Weekly Reflection Coach
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:3001/api/auth/github/callback`
4. Click "Register application"
5. Copy the **Client ID**
6. Generate a new **Client Secret** and copy it

### 2. Update `.env` File

Add the credentials to your `.env` file:

```env
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

## Complete `.env` Configuration

Your final `.env` file should look like this:

```env
OPENAI_API_KEY=sk-proj-your-api-key-here

# Google Calendar OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# OAuth Redirect Base URL
OAUTH_REDIRECT_BASE_URL=http://localhost:3001

# Session Secret (generate a random string for production)
SESSION_SECRET=your-random-session-secret-change-in-production
```

## Testing the Integration

1. Start both servers:
   ```bash
   npm run dev:full
   ```

2. Open the application in your browser: `http://localhost:5173`

3. Click on the integration buttons in the header to connect:
   - "Google Calendarを連携" - Connect Google Calendar
   - "GitHubを連携" - Connect GitHub

4. Complete the OAuth flow in the popup window

5. Once connected, the coach can access your activity data during sessions by calling the `fetch_weekly_activity` tool

## How It Works

### Architecture

1. **Frontend** (`src/voice-agent.ts`):
   - Initiates OAuth flow when user clicks integration buttons
   - Opens popup for authentication
   - Syncs data after successful authentication
   - Fetches snapshots from backend during coaching sessions

2. **Backend** (`server.js`):
   - Handles OAuth callbacks and token storage
   - Stores OAuth tokens in session storage
   - Fetches raw data from Google Calendar and GitHub APIs
   - Provides snapshot endpoints for transformed data

3. **Service Layer**:
   - `src/services/google-calendar-service.ts` - Transforms calendar events into coaching insights
   - `src/services/github-service.ts` - Transforms GitHub activity into development insights

### Data Flow

1. User clicks integration button
2. Frontend fetches OAuth URL from backend
3. User authenticates in popup window
4. OAuth callback stores tokens in session
5. Frontend triggers data sync
6. Backend fetches raw data from APIs
7. Frontend transforms data into snapshots
8. Coach accesses snapshots via `fetch_weekly_activity` tool

## Troubleshooting

### "Authentication failed"

- Verify your Client ID and Client Secret are correct
- Check that redirect URIs match exactly (including protocol and port)
- Ensure the OAuth consent screen is configured properly

### "No data available"

- Make sure you've clicked the sync button after authentication
- Check browser console for error messages
- Verify API scopes are correctly configured

### CORS errors

- Ensure both frontend (5173) and backend (3001) are running
- Check that CORS is configured correctly in `server.js`

## Security Notes

1. **Never commit `.env` file** - It contains sensitive credentials
2. **Session Secret** - Use a strong random string in production
3. **HTTPS in Production** - Always use HTTPS in production environments
4. **Token Storage** - Tokens are stored in session storage (server-side)
5. **Scopes** - Request only the minimum required scopes

## Production Deployment

For production deployment:

1. Update `OAUTH_REDIRECT_BASE_URL` to your production domain
2. Update OAuth redirect URIs in Google Cloud Console and GitHub
3. Set `cookie.secure: true` in session configuration
4. Use environment variables instead of `.env` file
5. Implement proper session storage (Redis, database)
6. Add rate limiting and error handling

## Support

If you encounter issues:
1. Check the browser console for errors
2. Check the server logs for backend errors
3. Verify all environment variables are set correctly
4. Ensure you have the latest code changes
