# Repository Guidelines

## Project Structure & Module Organization
The realtime coach UI lives in `src/`; `main.ts` wires DOM state while `voice-agent.ts` orchestrates the RealtimeAgent session. Shared telemetry and UI helpers sit under `src/utils/` (logger, usage tracker, timer, speaking animation). Styling resides in `src/style.css`, and static assets belong to `public/`. `server.js` hosts the local Express token broker, while `generate-token.js` is a CLI fallback. Store long-form explainers inside `docs/`. Built files output to `dist/` via Vite; avoid editing generated content directly.

## Build, Test, and Development Commands
Run `npm run dev` for the Vite frontend on port 5173. Use `npm run server` to start the token service on port 3001; `npm run dev:full` launches both via `concurrently` for end-to-end testing. `npm run build` performs a TypeScript type-check and Vite production build, emitting assets into `dist/`. `npm run preview` serves the built bundle for quick smoke tests.

## Coding Style & Naming Conventions
Write TypeScript in ES module style, keeping imports explicit (`.ts` extensions enabled). Follow the existing no-semicolon formatting and 2-space indentation used across `src/`. Prefer descriptive camelCase for variables/functions and PascalCase for exported types. Align utility modules with the current file naming (`conversation-logger.ts`, etc.). Keep DOM ids/classes lowercase with hyphen separators to match `style.css`. Maintain strict compiler settings (`tsconfig.json`)—fix unused symbol warnings instead of suppressing them.

## Testing Guidelines
Automated tests are not yet configured; rely on manual verification. After changes, run `npm run dev:full`, connect a session, and confirm the conversation log, usage dashboard, and session timer all update. When touching cost calculations, also inspect console usage dumps for regressions. If you introduce tests, colocate them beside the source file using `.test.ts` and document the new command here.

## Commit & Pull Request Guidelines
Commit messages should stay concise and imperative, mirroring existing history (`Add LICENSE`, `Translate UI messages into Japanese`). Group related changes per commit, and mention user-facing impacts in the body when needed. PRs should link relevant issues, summarize behavior changes, note manual testing steps, and include screenshots or console output for UI updates.

## Security & Configuration Tips
Create a `.env` with `OPENAI_API_KEY=…` and never commit it. The key is required by both `server.js` and `generate-token.js`; run commands with the variable exported in your shell. Ephemeral tokens expire quickly, so regenerate them for each session and avoid pasting them into commit messages or logs.
