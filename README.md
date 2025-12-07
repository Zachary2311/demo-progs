# CF Chat

A production-ready, end-to-end AI chat website hosted entirely on **Cloudflare Workers**.

## Features

- 🤖 **AI Chat** with streaming responses and markdown rendering
- 🧠 **Deep Thinking** mode for advanced reasoning (gpt-oss-120b)
- 🎨 **Image Generation** via flux-1-schnell
- 🔊 **Text-to-Speech** for AI responses via aura-2-en
- 📁 **File Uploads** up to 2MB stored in R2
- 🔐 **Secure Auth** with JWT tokens and bcrypt password hashing
- 📧 **Email Verification** for new signups
- ⚡ **Real-time** WebSocket chat rooms via Durable Objects
- 📊 **Admin Dashboard** with usage analytics
- 🚦 **Rate Limiting** (100 requests/user/day)

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Object Storage**: Cloudflare R2
- **Real-time**: Durable Objects
- **AI**: Workers AI (gpt-oss-20b, gpt-oss-120b, flux-1-schnell, aura-2-en)
- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS
- **Auth**: JWT + bcrypt

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) v3+
- [Cloudflare Account](https://dash.cloudflare.com/) with Workers, D1, R2, and KV enabled

## Quick Start

### 1. Clone and Install

```bash
cd cf-chat
npm install
```

### 2. Create Cloudflare Resources

```bash
# Create D1 database
wrangler d1 create cf-chat-db

# Create R2 bucket
wrangler r2 bucket create cf-chat-files

# Create KV namespace
wrangler kv:namespace create KV
```

### 3. Update wrangler.toml

Copy the IDs from the commands above and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "cf-chat-db"
database_id = "YOUR_D1_ID"

[[r2_buckets]]
binding = "R2"
bucket_name = "cf-chat-files"

[[kv_namespaces]]
binding = "KV"
id = "YOUR_KV_ID"
```

### 4. Set Environment Variables

```bash
# Set secrets
wrangler secret put JWT_SECRET
wrangler secret put SMTP_HOST
wrangler secret put SMTP_PORT
wrangler secret put SMTP_USER
wrangler secret put SMTP_PASS
wrangler secret put SMTP_FROM
wrangler secret put APP_URL
```

### 5. Run Database Migration

```bash
npm run migrate
```

### 6. Local Development

```bash
npm run dev
```

This starts:
- Vite dev server on `http://localhost:5173`
- Wrangler dev server on `http://localhost:8787`

### 7. Deploy

```bash
npm run deploy
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT signing | Random 32+ char string |
| `SMTP_HOST` | Email service host | `api.mailgun.net` |
| `SMTP_PORT` | Email service port | `587` |
| `SMTP_USER` | Email service username | `api` |
| `SMTP_PASS` | Email service password/API key | `key-xxx` |
| `SMTP_FROM` | Sender email address | `noreply@example.com` |
| `APP_URL` | Your application URL | `https://cf-chat.example.com` |

## Project Structure

```
cf-chat/
├── .github/
│   └── workflows/
│       └── ci.yml          # GitHub Actions CI/CD
├── migrations/
│   └── 0001_init.sql       # Database schema
├── src/
│   ├── durable-objects/
│   │   ├── ChatRoom.ts     # WebSocket Durable Object
│   │   └── index.ts
│   ├── lib/
│   │   ├── ai.ts           # AI client wrapper
│   │   ├── auth.ts         # JWT & bcrypt utilities
│   │   ├── email.ts        # Email sending
│   │   ├── rateLimit.ts    # Rate limiting
│   │   ├── settings.ts     # App settings
│   │   ├── storage.ts      # R2 file storage
│   │   └── index.ts
│   ├── routes/
│   │   ├── admin.ts        # Admin API routes
│   │   ├── auth.ts         # Auth API routes
│   │   ├── chat.ts         # Chat API routes
│   │   ├── files.ts        # File upload routes
│   │   └── websocket.ts    # WebSocket routes
│   ├── types/
│   │   └── index.ts        # TypeScript definitions
│   ├── web/
│   │   ├── api/            # Frontend API client
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── store/          # Zustand stores
│   │   ├── styles/         # CSS styles
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── __tests__/          # Test files
│   └── worker.ts           # Main Worker entry
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── wrangler.toml
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development servers |
| `npm run build` | Build for production |
| `npm run deploy` | Deploy to Cloudflare |
| `npm run type-check` | TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests with coverage |
| `npm run migrate` | Run database migrations |

## Admin Dashboard

The first registered user automatically becomes an admin. Access the admin dashboard at `/admin` to:

- View usage analytics
- Manage users
- Toggle feature flags (image generation, deep thinking)
- Adjust model settings (temperature, max tokens)
- Browse and manage files

## API Endpoints

### Auth
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/verify?token=...` - Verify email
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/me` - Get current user

### Chat
- `GET /api/chat/conversations` - List conversations
- `GET /api/chat/conversations/:id` - Get conversation with messages
- `POST /api/chat/conversations` - Create conversation
- `DELETE /api/chat/conversations/:id` - Delete conversation
- `POST /api/chat/message` - Send message (streaming response)
- `POST /api/chat/image` - Generate image
- `POST /api/chat/tts` - Text-to-speech

### Files
- `POST /api/files/upload` - Upload file
- `GET /api/files/*` - Get file
- `DELETE /api/files/:id` - Delete file

### Admin
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/users` - List users
- `PUT /api/admin/users/:id/admin` - Toggle admin status
- `GET /api/admin/settings` - Get settings
- `PUT /api/admin/settings` - Update settings
- `GET /api/admin/files` - List all files
- `DELETE /api/admin/files/:id` - Delete file

## License

MIT - See [LICENSE](LICENSE) file.
