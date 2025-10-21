# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### App Commands
- `npm run dev` – Start the Next.js development server (frontend + API on http://localhost:3000)
- `npm run dev:full` – Alias for `npm run dev` (kept for continuity)
- `npm run build` – Run the full `next build` pipeline (type-check + production bundle)
- `npm run start` – Serve the optimized production build
- `npm run lint` – Execute Next.js ESLint checks

### Environment Setup
- Requires `.env` with `OPENAI_API_KEY=sk-proj-...`
- Optional overrides: `OPENAI_REALTIME_MODEL`, `NEXT_PUBLIC_TOKEN_ENDPOINT`
- OpenAI API key must include Realtime API access

## Architecture Overview

This is a **Weekly Reflection Coaching application** using OpenAI's GPT Realtime API to provide voice-based coaching sessions following ICF (International Coach Federation) Core Competencies.

### Core Components

**Frontend (Next.js + TypeScript):**
- `app/page.tsx` – Initializes the realtime experience and mounts the composed UI
- `components/realtime/` – Presentational components that render the coaching interface
- `app/layout.tsx` – Global document shell and metadata
- `app/globals.css` – Complete styling for the coaching UI

**Logic & Orchestration (`lib/`):**
- `lib/voice-agent/index.ts` – Core voice interaction logic using `@openai/agents`
- `lib/voice-agent/session-analyzer/` – Adaptive session intelligence helper
- `lib/voice-agent/utils/` – Timers, usage tracker, prompt presets, logging helpers
- `lib/voice-agent/prompt-builder.ts` – Dynamic instructions for the agent
- `lib/voice-agent/personality-recommendation.ts` – Questionnaire scoring and messaging

**Backend (Next.js API routes):**
- `app/api/generate-token/route.ts` – Secure ephemeral token broker
- `app/api/health/route.ts` – Development health check endpoint
- `generate-token.js` – CLI fallback for manual token generation

### Key Architecture Patterns

**Single Next.js Application:**
- Next.js serves both the React UI and API routes on the same origin
- Development server and production build share the same entry points

**Voice Integration:**
- Uses `@openai/agents` SDK with `RealtimeAgent` / `RealtimeSession`
- Ephemeral token authentication (generated server-side for security)
- Real-time audio transport via WebRTC

**Coaching Session Structure:**
- 10-minute structured sessions: Opening → Reflection → Insights → Integration → Closing
- ICF Core Competencies implementation for professional coaching approach
- Real-time usage/cost tracking with detailed token consumption analytics

**State Management:**
- Interactive state managed in `lib/voice-agent/index.ts` (connection status, timers, usage stats)
- Conversation logging with timestamps and role identification
- Cost calculation for different OpenAI pricing models

### Important Technical Details

**Token Generation:**
- Ephemeral tokens generated via the Next.js API route at `/api/generate-token`
- Tokens start with `ek_` and expire quickly; never expose the main API key to the browser
- CLI fallback `generate-token.js` remains available for manual testing

**Usage Analytics:**
- Real-time token consumption tracking (input/output/cached/audio/text) via console logs
- Cost breakdown with multiple pricing model support
- Console logging every 10 seconds during active sessions

**TypeScript Configuration:**
- Strict mode enabled with the Next.js TypeScript plugin
- `moduleResolution: "Bundler"` and explicit `.ts`/`.tsx` imports per repository style
- ESLint powered by `eslint-config-next`

### Development Workflow

**Local Development:**
1. Create `.env` with `OPENAI_API_KEY=sk-proj-...`
2. Run `npm run dev`
3. Visit http://localhost:3000 and allow microphone access when prompted
4. The UI and token broker share the same origin (`/api/generate-token`)

**Production / Vercel Deployment:**
1. Configure `OPENAI_API_KEY` (and optional overrides) in Vercel environment settings
2. Deploy via `vercel` CLI or Git integration – the Next.js build produces `.next/`
3. API routes deploy automatically alongside the UI under `/api/*`
4. Confirm the deployment by starting a session and monitoring the console for errors

The application requires microphone permissions and modern browser support for WebRTC functionality.
