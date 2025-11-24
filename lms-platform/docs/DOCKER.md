# Docker Deployment Guide

Complete guide for deploying the LMS Platform using Docker.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+ (for compose method)
- At least 2GB RAM available
- Ports 80, 3001, 3306 available

## Method 1: Using Docker Compose (Recommended)

Docker Compose orchestrates all services automatically.

### Quick Start

```bash
# 1. Configure environment
cd lms-platform
cp .env.example .env
# Edit .env with your Discord credentials and secrets

# 2. Start all services
docker-compose up -d

# 3. View logs
docker-compose logs -f

# 4. Check status
docker-compose ps
```

### Services Started

- **mysql** - MySQL 8.0 database (port 3306)
- **backend** - Node.js API server (port 3001)
- **frontend** - React app with Nginx (port 80)

### Useful Commands

```bash
# Stop all services
docker-compose down

# Stop and remove all data
docker-compose down -v

# Restart a specific service
docker-compose restart backend

# View service logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mysql

# Execute command in container
docker-compose exec backend npm run seed
docker-compose exec mysql mysql -u root -p

# Rebuild after code changes
docker-compose build
docker-compose up -d
```

## Method 2: Using Standalone Dockerfiles

Build and run containers individually without Docker Compose.

### Step 1: Create Docker Network

```bash
docker network create lms-network
```

### Step 2: Run MySQL Database

```bash
docker run -d \
  --name lms-mysql \
  --network lms-network \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=lms_db \
  -e MYSQL_USER=lmsuser \
  -e MYSQL_PASSWORD=lmspassword \
  -p 3306:3306 \
  -v lms-mysql-data:/var/lib/mysql \
  mysql:8.0

# Wait for MySQL to be ready
docker logs -f lms-mysql
# Press Ctrl+C once you see "ready for connections"
```

### Step 3: Build and Run Backend

```bash
# Build backend image
cd lms-platform/backend
docker build -t lms-backend .

# Run backend container
docker run -d \
  --name lms-backend \
  --network lms-network \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -e DATABASE_URL="mysql://lmsuser:lmspassword@lms-mysql:3306/lms_db" \
  -e FRONTEND_URL="http://localhost" \
  -e DISCORD_CLIENT_ID="your_discord_client_id" \
  -e DISCORD_CLIENT_SECRET="your_discord_client_secret" \
  -e DISCORD_REDIRECT_URI="http://localhost:3001/api/auth/discord/callback" \
  -e JWT_SECRET="your_super_secret_jwt_key_minimum_32_characters" \
  -e JWT_REFRESH_SECRET="your_super_secret_refresh_key_minimum_32_characters" \
  -e JWT_EXPIRES_IN="15m" \
  -e JWT_REFRESH_EXPIRES_IN="7d" \
  -e API_URL="http://localhost:3001" \
  -v lms-uploads:/app/uploads \
  lms-backend

# View backend logs
docker logs -f lms-backend
```

### Step 4: Build and Run Frontend

```bash
# Build frontend image
cd lms-platform/frontend
docker build -t lms-frontend .

# Run frontend container
docker run -d \
  --name lms-frontend \
  --network lms-network \
  -p 80:80 \
  lms-frontend

# View frontend logs
docker logs -f lms-frontend
```

### Step 5: Seed Database (Optional)

```bash
docker exec lms-backend npm run seed
```

### Useful Commands for Standalone Method

```bash
# Stop containers
docker stop lms-frontend lms-backend lms-mysql

# Start containers
docker start lms-mysql lms-backend lms-frontend

# Remove containers
docker rm -f lms-frontend lms-backend lms-mysql

# Remove network
docker network rm lms-network

# Remove volumes (WARNING: deletes all data)
docker volume rm lms-mysql-data lms-uploads

# View logs
docker logs -f lms-backend
docker logs -f lms-frontend
docker logs -f lms-mysql

# Execute commands in containers
docker exec -it lms-backend sh
docker exec -it lms-mysql mysql -u root -p
```

## Method 3: Development Mode with Docker

For local development with hot reloading.

### Backend Development

```bash
cd lms-platform/backend

# Run with mounted source code
docker run -d \
  --name lms-backend-dev \
  --network lms-network \
  -p 3001:3001 \
  -e NODE_ENV=development \
  -e DATABASE_URL="mysql://lmsuser:lmspassword@lms-mysql:3306/lms_db" \
  -v $(pwd):/app \
  -v /app/node_modules \
  node:18-alpine \
  sh -c "npm install && npm run dev"
```

### Frontend Development

```bash
cd lms-platform/frontend

# Run with mounted source code
docker run -d \
  --name lms-frontend-dev \
  -p 3000:3000 \
  -e VITE_API_URL="http://localhost:3001" \
  -v $(pwd):/app \
  -v /app/node_modules \
  node:18-alpine \
  sh -c "npm install && npm run dev -- --host"
```

## Building Custom Images

### Backend Dockerfile Explained

```dockerfile
# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 2: Production
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p uploads
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```

**Multi-stage build benefits:**
- Smaller final image (only production dependencies)
- Faster builds (layers cached)
- More secure (no build tools in production)

### Frontend Dockerfile Explained

```dockerfile
# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production with Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Features:**
- Production-optimized React build
- Nginx for efficient static file serving
- Custom nginx configuration
- Minimal final image size

## Environment Variables

### Required Variables

```env
# Database
DATABASE_URL=mysql://user:password@host:3306/database

# Discord OAuth2
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://localhost:3001/api/auth/discord/callback

# JWT Secrets (MUST be strong random strings)
JWT_SECRET=minimum_32_character_random_string
JWT_REFRESH_SECRET=minimum_32_character_random_string
```

### Optional Variables

```env
# Application
NODE_ENV=production
PORT=3001
FRONTEND_URL=http://localhost
API_URL=http://localhost:3001

# JWT Expiration
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# File Upload
MAX_FILE_SIZE=52428800
UPLOAD_DIR=./uploads

# Discord Webhooks
DISCORD_WEBHOOK_ENABLED=false
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs lms-backend
docker logs lms-frontend
docker logs lms-mysql

# Check if ports are available
netstat -tuln | grep -E '80|3001|3306'

# Check container status
docker ps -a
```

### Database Connection Issues

```bash
# Test MySQL connectivity
docker exec lms-mysql mysql -u root -p -e "SHOW DATABASES;"

# Check backend can reach MySQL
docker exec lms-backend ping lms-mysql

# Verify DATABASE_URL format
# Format: mysql://username:password@hostname:3306/database
```

### Backend Build Fails

```bash
# Clear build cache
docker builder prune

# Rebuild without cache
docker build --no-cache -t lms-backend .

# Check Node.js version
docker run --rm node:18-alpine node --version
```

### Frontend Not Accessible

```bash
# Check if Nginx is running
docker exec lms-frontend ps aux

# Test Nginx configuration
docker exec lms-frontend nginx -t

# Check frontend build output
docker exec lms-frontend ls -la /usr/share/nginx/html
```

### Permission Issues

```bash
# Fix upload directory permissions (backend)
docker exec lms-backend chmod -R 755 uploads

# Fix MySQL data directory permissions
sudo chown -R 999:999 /var/lib/docker/volumes/lms-mysql-data
```

## Performance Optimization

### Resource Limits

Add to docker-compose.yml or docker run:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

Or with docker run:
```bash
docker run --cpus="1.0" --memory="1g" ...
```

### Build Optimization

```bash
# Use BuildKit for faster builds
export DOCKER_BUILDKIT=1
docker build -t lms-backend .

# Use layer caching
# Separate dependency installation from code copy
```

### Image Size Optimization

```bash
# View image sizes
docker images | grep lms

# Remove unused images
docker image prune

# Multi-stage builds already implemented
# Alpine base images for smaller size
```

## Health Checks

Add health checks to ensure services are running:

```yaml
# docker-compose.yml
services:
  backend:
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## Security Best Practices

1. **Never commit secrets**
   - Use `.env` files
   - Add `.env` to `.gitignore`

2. **Use specific image versions**
   - `node:18-alpine` instead of `node:latest`
   - `mysql:8.0` instead of `mysql:latest`

3. **Run as non-root user**
   - Already implemented in Dockerfiles
   - Node.js runs as `node` user

4. **Scan images for vulnerabilities**
   ```bash
   docker scan lms-backend
   docker scan lms-frontend
   ```

5. **Keep images updated**
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

## Backup and Restore

### Backup Database

```bash
# Using docker-compose
docker-compose exec mysql mysqldump -u root -p lms_db > backup.sql

# Using standalone container
docker exec lms-mysql mysqldump -u root -p lms_db > backup.sql
```

### Restore Database

```bash
# Using docker-compose
docker-compose exec -T mysql mysql -u root -p lms_db < backup.sql

# Using standalone container
docker exec -i lms-mysql mysql -u root -p lms_db < backup.sql
```

### Backup Uploaded Files

```bash
# Backup uploads volume
docker run --rm -v lms-uploads:/data -v $(pwd):/backup \
  alpine tar czf /backup/uploads-backup.tar.gz /data
```

### Restore Uploaded Files

```bash
# Restore uploads volume
docker run --rm -v lms-uploads:/data -v $(pwd):/backup \
  alpine tar xzf /backup/uploads-backup.tar.gz -C /
```

## Production Deployment

For production with HTTPS and reverse proxy:

```bash
# Use production profile
docker-compose --profile production up -d

# This starts:
# - mysql
# - backend
# - frontend
# - nginx-proxy (with SSL)
```

See `DEPLOYMENT.md` for complete production setup instructions.

## Monitoring

### View Resource Usage

```bash
# Docker stats
docker stats lms-backend lms-frontend lms-mysql

# Container processes
docker top lms-backend
```

### View Container Details

```bash
# Inspect container
docker inspect lms-backend

# View environment variables
docker exec lms-backend env
```

## Next Steps

1. Configure Discord OAuth2 application
2. Set up environment variables
3. Choose deployment method (Compose or standalone)
4. Start services
5. Access application at http://localhost
6. Create admin user if needed
7. Configure webhooks (optional)
8. Set up backups
9. Configure monitoring

For more information:
- API Documentation: http://localhost:3001/api-docs
- Health Check: http://localhost:3001/health
- Database migrations: `docker-compose exec backend npx prisma migrate`
