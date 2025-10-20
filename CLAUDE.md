# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Server Commands
- `npm run dev` - Start Vite development server (frontend on port 5173)
- `npm run server` - Start Express token generation server (backend on port 3001)
- `npm run dev:full` - Start both servers concurrently (recommended for development)
- `npm run build` - Build production version (TypeScript compilation + Vite build)
- `npm run preview` - Preview production build

### Environment Setup
- Requires `.env` file with `OPENAI_API_KEY=sk-proj-...`
- OpenAI API key must have access to Realtime API
- Example environment file available at `.env.example`

## Architecture Overview

This is a **Weekly Reflection Coaching application** using OpenAI's GPT Realtime API to provide voice-based coaching sessions following ICF (International Coach Federation) Core Competencies.

### Core Components

**Frontend (Vite + TypeScript):**
- `src/main.ts` - Main UI setup with coaching session interface
- `src/voice-agent.ts` - Core voice interaction logic using @openai/agents
- `src/style.css` - Complete styling with dark/light mode support

**Backend:**
- `server.js` - Express token generation server for local development (port 3001)
- `api/generate-token.ts` - Vercel serverless function for production deployment
- `vite.config.ts` - Development proxy configuration (proxies /api to localhost:3001)

### Key Architecture Patterns

**Dual Server Architecture:**
- Frontend development server (Vite) on port 5173
- Backend token server (Express) on port 3001
- Both can be started together with `npm run dev:full`

**Voice Integration:**
- Uses `@openai/agents` SDK with RealtimeAgent/RealtimeSession
- Ephemeral token authentication (generated server-side for security)
- Real-time audio processing with WebRTC transport

**Coaching Session Structure:**
- 10-minute structured sessions: Opening → Reflection → Insights → Integration → Closing
- ICF Core Competencies implementation for professional coaching approach
- Real-time usage/cost tracking with detailed token consumption analytics

**State Management:**
- Session state tracked in `voice-agent.ts` (connection status, timers, usage stats)
- Conversation logging with timestamps and role identification
- Cost calculation for different OpenAI pricing models

### Important Technical Details

**Token Generation:**
- Ephemeral tokens generated via `/api/generate-token` endpoint
- Tokens start with "ek_" and are temporary/secure
- Local development: Express server (server.js) on port 3001
- Production (Vercel): Serverless function (api/generate-token.ts)

**Usage Analytics:**
- Real-time token consumption tracking (input/output/cached/audio/text) via console logs
- Cost breakdown with multiple pricing model support
- Console logging every 10 seconds during active sessions

**TypeScript Configuration:**
- Strict mode enabled with comprehensive linting rules
- ES2022 target with bundler module resolution
- Vite client types included for development

### Development Workflow

**Local Development:**
1. Set up `.env` file with `OPENAI_API_KEY=sk-proj-...`
2. Run `npm run dev:full` to start both servers (Express on port 3001 + Vite on port 5173)
3. Frontend automatically proxies `/api` requests to Express server
4. All voice interactions happen through ephemeral tokens (never expose main API key to client)

**Vercel Deployment:**
1. Set `OPENAI_API_KEY` environment variable in Vercel project settings
2. Deploy via `vercel` command or Git integration
3. `api/generate-token.ts` automatically becomes a serverless function
4. Frontend is served as static files from `dist` directory

The application requires microphone permissions and modern browser support for WebRTC functionality.
