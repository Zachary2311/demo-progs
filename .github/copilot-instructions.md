# Copilot Instructions for Edge Voice Studio

## Architecture Overview

This is a **Cloudflare Workers** application (`audio-cf`) - a single monolithic JavaScript file (`src/index.js`) that serves both the API backend and frontend HTML. The app provides:

- **Authentication**: Session-based auth with cookie management
- **Speech-to-Text**: Cloudflare AI Whisper model (`@cf/openai/whisper`)
- **Text-to-Speech**: Deepgram Aura-2 model (`@cf/deepgram/aura-2-en`)
- **AI Chat**: GPT-OSS-120B model (`@cf/openai/gpt-oss-120b`) with streaming support

### Key Bindings (wrangler.toml)
- `env.AI` - Cloudflare Workers AI binding
- `env.DB` - D1 SQLite database (`voice_app`)

## Code Structure

The entire application lives in `src/index.js` (~3900 lines):
1. **Route handler** (top): `fetch()` function with manual path matching
2. **Helpers** (lines ~77-165): `json()`, `parseCookies()`, `hashPassword()`, `createSession()`
3. **Auth handlers** (~170-300): signup/login/logout/me
4. **Feature handlers** (~300-1100): transcription, TTS, chat (non-streaming and streaming)
5. **Frontend** (~1150-3877): Full HTML/CSS/JS in `getFrontendHtml()` template literal

## Database Schema

Migrations in `migrations/` define the schema (execute in order):
- `users` / `sessions` - Auth tables
- `transcriptions` / `tts_history` - Usage history
- `chat_messages` - Chat with `parent_message_id` for conversation branching
- `user_preferences` - Custom system prompts

## Development Workflow

```bash
# Local development
npx wrangler dev

# Database migrations
npx wrangler d1 migrations apply voice_app --local   # local
npx wrangler d1 migrations apply voice_app --remote  # production

# Deploy
npx wrangler deploy
```

## Key Patterns

### Response Helpers
Always use the `json()` helper for API responses:
```javascript
return json({ ok: true, data: ... });           // success
return json({ ok: false, error: "..." }, 400);  // error
return unauthorized();                           // 401
```

### Auth Check Pattern
Every protected endpoint starts with:
```javascript
const user = await getSessionUser(env, request);
if (!user) return unauthorized();
```

### AI Model Calls
Use Cloudflare's Responses API format:
```javascript
const response = await env.AI.run("@cf/openai/gpt-oss-120b", {
  instructions: systemPrompt,
  input: conversationString,
  stream: true,  // optional for SSE
});
```

### Streaming Responses
The streaming chat handler uses `ReadableStream` with SSE format. Keepalive comments (`: keepalive\n\n`) prevent connection timeouts.

## Conventions

- **No package.json**: Pure Workers runtime, no npm dependencies (uses CDN for frontend libs)
- **Single file**: All code in one file for Workers simplicity
- **Frontend inline**: HTML returned from `getFrontendHtml()`, uses marked.js + highlight.js from CDN
- **Timestamps**: All dates stored as `Date.now()` (Unix milliseconds)
- **Migrations**: Sequential SQL files in `migrations/` folder

## Adding New Features

1. Add route in the `fetch()` handler's if-chain
2. Create handler function following the auth-check pattern
3. Add any new tables via numbered migration file
4. Test locally with `wrangler dev`
