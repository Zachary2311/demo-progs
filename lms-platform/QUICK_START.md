# Quick Start Guide - LMS Platform

Get the LMS Platform running in 5 minutes!

## Prerequisites

- Docker and Docker Compose installed
- Discord Developer Application
- 5 minutes of your time

## Step 1: Discord Setup (2 minutes)

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Name it "LMS Platform" and create
4. Go to OAuth2 → General
5. Add Redirect URI: `http://localhost:3001/api/auth/discord/callback`
6. Copy your **Client ID** and **Client Secret**

## Step 2: Configure Environment (1 minute)

```bash
cd lms-platform
cp .env.example .env
```

Edit `.env` and set:
```env
DISCORD_CLIENT_ID=paste_your_client_id_here
DISCORD_CLIENT_SECRET=paste_your_client_secret_here

# SECURITY WARNING: NEVER use placeholder values in production!
# Generate strong random secrets using the commands below:
JWT_SECRET=<run command below to generate>
JWT_REFRESH_SECRET=<run command below to generate>
```

⚠️ **CRITICAL SECURITY WARNING**: Never use placeholder or example secrets in any environment!

**Generate secure secrets:**
```bash
# Generate JWT_SECRET (64+ characters)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate JWT_REFRESH_SECRET (64+ characters)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Minimum Requirements:**
- JWT secrets must be at least 64 characters
- Use cryptographically random strings
- Never commit secrets to version control
- Rotate secrets periodically
- Use different secrets for development and production

## Step 3: Start the Platform (2 minutes)

### Option A: Docker Compose (Recommended)

```bash
docker-compose up -d
```

Wait for services to start (about 60 seconds), then:

```bash
# Seed the database with default roles
docker-compose exec backend npm run seed
```

### Option B: Individual Docker Containers

```bash
# 1. Create network
docker network create lms-network

# 2. Start MySQL
# ⚠️ SECURITY: Replace passwords with secure values
docker run -d --name lms-mysql --network lms-network \
  -e MYSQL_ROOT_PASSWORD=<use_secure_password> \
  -e MYSQL_DATABASE=lms_db \
  -e MYSQL_USER=lmsuser \
  -e MYSQL_PASSWORD=<use_secure_password> \
  -p 3306:3306 mysql:8.0

# Wait 30 seconds for MySQL to start

# 3. Start Backend
cd backend
docker build -t lms-backend .
# ⚠️ SECURITY: Replace all placeholder values with actual secrets
docker run -d --name lms-backend --network lms-network \
  -p 3001:3001 \
  -e DATABASE_URL="mysql://lmsuser:<password>@lms-mysql:3306/lms_db" \
  -e DISCORD_CLIENT_ID="<your_actual_client_id>" \
  -e DISCORD_CLIENT_SECRET="<your_actual_client_secret>" \
  -e JWT_SECRET="<generated_64_char_secret>" \
  -e JWT_REFRESH_SECRET="<generated_64_char_secret>" \
  lms-backend

# 4. Start Frontend
cd ../frontend
docker build -t lms-frontend .
docker run -d --name lms-frontend -p 80:80 lms-frontend
```

## Step 4: Access the Platform

Open your browser:

- **Application**: http://localhost
- **API Documentation**: http://localhost:3001/api-docs
- **Health Check**: http://localhost:3001/health

## First Login

1. Click "Login with Discord"
2. Authorize the application
3. You'll be redirected back and logged in!
4. By default, you'll have the "student" role

## Default Users & Roles

After seeding, these roles exist:
- **student** - Can enroll in courses
- **instructor** - Can create courses
- **admin** - Full system access

To promote yourself to instructor or admin, use the database:

```bash
# Connect to MySQL
docker-compose exec mysql mysql -u root -p lms_db

# Run SQL to add instructor role to your user
# (Replace 'your-discord-id' with your actual Discord ID)
INSERT INTO user_roles (userId, roleId)
SELECT id, (SELECT id FROM roles WHERE name = 'instructor')
FROM users WHERE discordId = 'your-discord-id';
```

## Common Commands

### View Logs
```bash
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Restart Services
```bash
docker-compose restart
docker-compose restart backend
```

### Stop Everything
```bash
docker-compose down
```

### Stop and Remove All Data
```bash
docker-compose down -v
```

### Rebuild After Code Changes
```bash
docker-compose build
docker-compose up -d
```

## Troubleshooting

### "Can't connect to Discord"
- Check your Client ID and Secret in `.env`
- Verify redirect URI matches in Discord app settings

### "Database connection error"
- Wait 30 seconds for MySQL to fully start
- Check logs: `docker-compose logs mysql`

### "Port already in use"
- Stop conflicting services or change ports in `docker-compose.yml`

### "Frontend shows blank page"
- Check backend is running: http://localhost:3001/health
- Check browser console for errors
- Verify CORS settings in backend

## Next Steps

1. **Create a Course**
   - Get instructor role (see above)
   - Go to instructor dashboard
   - Create your first course

2. **Explore Features**
   - Create modules and lessons
   - Add quizzes and assignments
   - Upload files
   - Check analytics

3. **Configure Webhooks** (Optional)
   - Create Discord webhook
   - Add URL to `.env`
   - Enable notifications

4. **Customize**
   - Modify Tailwind theme
   - Add custom branding
   - Configure email notifications

## Production Deployment

For production deployment with HTTPS:

```bash
docker-compose --profile production up -d
```

See `docs/DEPLOYMENT.md` for complete production setup.

## Documentation

- **Full README**: `/README.md`
- **API Documentation**: `/docs/API.md`
- **Database Schema**: `/docs/DATABASE.md`
- **Architecture**: `/docs/ARCHITECTURE.md`
- **Docker Guide**: `/docs/DOCKER.md`
- **UI Screenshots**: `/docs/SCREENSHOTS.md`
- **Deployment**: `/docs/DEPLOYMENT.md`

## Support

- Check logs: `docker-compose logs -f`
- Health check: http://localhost:3001/health
- API docs: http://localhost:3001/api-docs

## Development Mode

For local development with hot reload:

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

Then access:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

---

**You're all set! 🎉**

Start creating courses and building your learning platform!
