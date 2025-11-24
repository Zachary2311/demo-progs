# Deployment Guide

This guide covers deploying the LMS Platform to production environments.

## Prerequisites

- Server with Docker and Docker Compose installed
- Domain name (for production)
- SSL certificate (Let's Encrypt recommended)
- Discord OAuth2 application configured
- MySQL 8.0+ database

## Environment Configuration

### 1. Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Update all values with production credentials:

```env
# MySQL
MYSQL_ROOT_PASSWORD=<strong-random-password>
MYSQL_DATABASE=lms_db
MYSQL_USER=lmsuser
MYSQL_PASSWORD=<strong-random-password>

# Application URLs
FRONTEND_URL=https://yourdomain.com
API_URL=https://yourdomain.com/api

# Discord OAuth2
DISCORD_CLIENT_ID=<your-discord-client-id>
DISCORD_CLIENT_SECRET=<your-discord-client-secret>
DISCORD_REDIRECT_URI=https://yourdomain.com/api/auth/discord/callback

# JWT Secrets (MUST be strong random strings)
JWT_SECRET=<generate-strong-secret-min-32-chars>
JWT_REFRESH_SECRET=<generate-strong-secret-min-32-chars>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Discord Webhooks (Optional)
DISCORD_WEBHOOK_ENABLED=true
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# File Upload
MAX_FILE_SIZE=52428800
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/gif,application/pdf,video/mp4,video/webm,application/zip

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 2. Generate Strong Secrets

Use these commands to generate secure secrets:

```bash
# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# JWT Refresh Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Docker Deployment

### Basic Deployment

```bash
# Pull and start all services
docker-compose up -d

# Check logs
docker-compose logs -f

# Check service status
docker-compose ps
```

### Production Deployment with NGINX Proxy

```bash
# Start with production profile (includes NGINX reverse proxy)
docker-compose --profile production up -d
```

### SSL Certificate Setup

#### Using Let's Encrypt

1. Install Certbot:

```bash
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
```

2. Generate certificate:

```bash
sudo certbot --nginx -d yourdomain.com
```

3. Copy certificates to deployment folder:

```bash
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem deployment/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem deployment/ssl/key.pem
```

4. Restart services:

```bash
docker-compose --profile production restart
```

## Manual Deployment

### Backend Deployment

1. **Install Dependencies:**

```bash
cd backend
npm ci --only=production
```

2. **Build Application:**

```bash
npm run build
```

3. **Run Database Migrations:**

```bash
npx prisma migrate deploy
```

4. **Seed Database:**

```bash
npm run seed
```

5. **Start Application:**

```bash
# Using PM2 (recommended)
pm2 start dist/index.js --name lms-backend

# Or using systemd
sudo systemctl start lms-backend
```

### Frontend Deployment

1. **Build Application:**

```bash
cd frontend
npm run build
```

2. **Serve with NGINX:**

Configure NGINX to serve the `dist` directory:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /path/to/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Database Backup

### Automated Backup Script

Create a backup script:

```bash
#!/bin/bash
BACKUP_DIR=/backups/mysql
DATE=$(date +%Y%m%d_%H%M%S)
docker exec lms_mysql mysqldump -u root -p${MYSQL_ROOT_PASSWORD} lms_db > ${BACKUP_DIR}/lms_db_${DATE}.sql
```

### Restore from Backup

```bash
docker exec -i lms_mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} lms_db < backup.sql
```

## Monitoring

### Docker Health Checks

```bash
# Check container health
docker-compose ps

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Application Logs

Backend logs are available at:
- Container: `docker-compose logs -f backend`
- File: Check your logging configuration

## Scaling

### Horizontal Scaling

Update `docker-compose.yml` to scale services:

```yaml
services:
  backend:
    deploy:
      replicas: 3
```

### Load Balancing

Configure NGINX for load balancing:

```nginx
upstream backend_servers {
    server backend1:3001;
    server backend2:3001;
    server backend3:3001;
}
```

## Performance Optimization

### Enable Caching

1. **Redis for Session Storage** (optional)
2. **CDN for Static Assets**
3. **Database Query Optimization**
4. **Enable GZIP Compression**

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_enrollments_user ON course_enrollments(userId);
CREATE INDEX idx_enrollments_course ON course_enrollments(courseId);
CREATE INDEX idx_lessons_module ON lessons(moduleId);
```

## Security Hardening

### 1. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

### 2. Database Security

- Use strong passwords
- Limit database access to backend only
- Regular security updates

### 3. Application Security

- Keep dependencies updated
- Enable rate limiting
- Use HTTPS only
- Implement CORS properly
- Regular security audits

## Troubleshooting

### Common Issues

**Issue: Database connection failed**
- Check MySQL is running: `docker-compose ps mysql`
- Verify DATABASE_URL in environment
- Check network connectivity

**Issue: Discord OAuth not working**
- Verify redirect URI matches Discord app settings
- Check DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET
- Ensure frontend URL is correct

**Issue: File uploads failing**
- Check MAX_FILE_SIZE setting
- Verify uploads directory has write permissions
- Check disk space

### Debug Mode

Enable debug logging:

```env
LOG_LEVEL=debug
NODE_ENV=development
```

## Maintenance

### Update Deployment

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose build
docker-compose up -d

# Run migrations
docker-compose exec backend npx prisma migrate deploy
```

### Database Maintenance

```bash
# Optimize tables
docker exec lms_mysql mysqlcheck -u root -p${MYSQL_ROOT_PASSWORD} --optimize lms_db

# Check integrity
docker exec lms_mysql mysqlcheck -u root -p${MYSQL_ROOT_PASSWORD} --check lms_db
```

## Monitoring & Alerts

### Set Up Monitoring

Recommended tools:
- **Prometheus** - Metrics collection
- **Grafana** - Visualization
- **Sentry** - Error tracking
- **UptimeRobot** - Uptime monitoring

### Health Check Endpoint

Monitor application health:

```bash
curl http://localhost:3001/health
```

## Rollback Procedure

If deployment fails:

```bash
# Stop current deployment
docker-compose down

# Restore from backup
docker exec -i lms_mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} lms_db < backup.sql

# Checkout previous version
git checkout <previous-commit>

# Rebuild and start
docker-compose up -d
```

## Support

For deployment issues:
1. Check logs: `docker-compose logs`
2. Review environment variables
3. Verify database connectivity
4. Check Discord OAuth configuration
5. Review firewall and network settings
