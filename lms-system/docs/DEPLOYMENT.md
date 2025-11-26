# Deployment Guide

## Table of Contents
1. [Docker Compose Deployment](#docker-compose-deployment)
2. [Production Configuration](#production-configuration)
3. [Environment Variables](#environment-variables)
4. [Database Setup](#database-setup)
5. [SSL/TLS Configuration](#ssltls-configuration)
6. [Health Checks](#health-checks)
7. [Monitoring](#monitoring)
8. [Backup & Recovery](#backup--recovery)

## Docker Compose Deployment

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 1.29+
- 2GB RAM minimum
- 10GB disk space

### Quick Start

1. **Clone Repository**
```bash
git clone <repository-url> lms-system
cd lms-system
```

2. **Configure Environment**
```bash
cp backend/.env.example .env
nano .env  # Edit with your settings
```

3. **Start Services**
```bash
docker-compose up -d
```

4. **Verify Services**
```bash
docker-compose ps
curl http://localhost/health
```

### Scaling Services

```bash
# Scale backend instances
docker-compose up -d --scale backend=3

# Scale frontend instances
docker-compose up -d --scale frontend=2
```

## Production Configuration

### 1. Environment Variables

**Essential Production Variables**
```env
NODE_ENV=production
API_URL=https://your-domain.com/api
FRONTEND_URL=https://your-domain.com

# Database
DATABASE_URL=mysql://user:password@db:3306/lms_db

# JWT Secrets (generate secure random values)
JWT_SECRET=generate-with-openssl-rand-base64-32
JWT_REFRESH_SECRET=generate-with-openssl-rand-base64-32

# Discord OAuth
DISCORD_CLIENT_ID=<your-client-id>
DISCORD_CLIENT_SECRET=<your-client-secret>
DISCORD_REDIRECT_URI=https://your-domain.com/api/auth/discord/callback

# Storage
STORAGE_PROVIDER=s3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>
AWS_S3_BUCKET=lms-uploads-production
```

### 2. Database Security

```sql
-- Create dedicated database user
CREATE USER 'lms_prod'@'%' IDENTIFIED BY '<strong-password>';
GRANT ALL PRIVILEGES ON lms_db.* TO 'lms_prod'@'%';
FLUSH PRIVILEGES;

-- Disable root remote access
DROP USER 'root'@'%';
```

### 3. NGINX Configuration for HTTPS

Update `docker/nginx.conf`:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # ... location blocks ...
}
```

## Environment Variables

### Backend Variables

| Variable | Default | Description |
|----------|---------|-------------|
| NODE_ENV | development | Environment mode |
| PORT | 3000 | Server port |
| DATABASE_URL | - | MySQL connection string |
| JWT_SECRET | - | JWT signing secret |
| JWT_EXPIRY | 15m | Token expiration |
| DISCORD_CLIENT_ID | - | Discord OAuth client ID |
| DISCORD_CLIENT_SECRET | - | Discord OAuth secret |
| STORAGE_PROVIDER | local | File storage backend |
| LOG_LEVEL | info | Logging level |

### Frontend Variables

| Variable | Default | Description |
|----------|---------|-------------|
| REACT_APP_API_URL | http://localhost:3000/api | API base URL |

## Database Setup

### Initial Setup

```bash
# Run migrations
docker-compose exec backend npm run db:migrate

# Seed sample data
docker-compose exec backend npm run db:seed
```

### Manual Database Connection

```bash
docker-compose exec db mysql -u lms_user -p lms_db

# Or from host
mysql -h 127.0.0.1 -u lms_user -p lms_db
```

### Backup Database

```bash
# Full backup
docker-compose exec db mysqldump -u lms_user -p lms_db > backup.sql

# With compression
docker-compose exec db mysqldump -u lms_user -p lms_db | gzip > backup.sql.gz
```

### Restore Database

```bash
# From SQL file
docker-compose exec -T db mysql -u lms_user -p lms_db < backup.sql

# From compressed file
gunzip < backup.sql.gz | docker-compose exec -T db mysql -u lms_user -p lms_db
```

## SSL/TLS Configuration

### Using Let's Encrypt with Certbot

```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates to project
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem docker/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem docker/ssl/key.pem
sudo chown $USER:$USER docker/ssl/*
```

### Certificate Auto-Renewal

```bash
# Certbot auto-renewal (cron job)
0 12 * * * certbot renew --quiet

# After renewal, restart NGINX
0 13 * * * docker-compose restart nginx
```

## Health Checks

### Endpoint Monitoring

```bash
# API health
curl http://localhost/health

# Database health
curl http://localhost/api/health

# Frontend (should return 200)
curl http://localhost/
```

### Docker Health Status

```bash
# Check all services
docker-compose ps

# View service logs
docker-compose logs -f service-name

# Specific service health
docker inspect --format='{{.State.Health}}' lms-backend
```

## Monitoring

### Log Aggregation

```bash
# View logs from all services
docker-compose logs -f

# Specific service
docker-compose logs -f backend

# With timestamps
docker-compose logs -f --timestamps backend

# Last N lines
docker-compose logs --tail=100 backend
```

### Performance Monitoring

```bash
# Database connections
docker-compose exec db mysql -u lms_user -p -e "SHOW PROCESSLIST;"

# Docker resource usage
docker stats

# NGINX access/error logs
docker-compose logs nginx
```

### Metrics Collection (Prometheus)

See `docs/monitoring.md` for Prometheus/Grafana setup.

## Backup & Recovery

### Automated Backups

Create `scripts/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/backups/lms"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Database backup
docker-compose exec -T db mysqldump -u lms_user -p lms_db | \
    gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Uploads backup
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz backend/uploads/

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete
```

Schedule with cron:
```bash
0 2 * * * /path/to/backup.sh
```

### Disaster Recovery

1. **Stop services**
```bash
docker-compose down
```

2. **Restore database**
```bash
docker-compose up -d db
sleep 10
gunzip < backup.sql.gz | docker-compose exec -T db mysql -u lms_user -p lms_db
```

3. **Restore uploads**
```bash
tar -xzf uploads_backup.tar.gz -C backend/
```

4. **Start all services**
```bash
docker-compose up -d
```

## Troubleshooting

### Out of Disk Space
```bash
# Clean up Docker
docker system prune
docker volume prune

# Check MySQL data size
du -sh mysql_data/
```

### Memory Issues
```bash
# Increase Docker memory limit
# Edit docker-compose.yml or set in .env
# Then: docker-compose up -d

# Monitor memory usage
docker stats --no-stream
```

### Slow Queries
```bash
# Enable query log
docker-compose exec db mysql -u lms_user -p -e \
  "SET GLOBAL slow_query_log = 'ON';"

# View slow queries
docker-compose exec db tail -f /var/log/mysql/slow.log
```

## Security Hardening

1. **Update packages regularly**
```bash
docker-compose pull
docker-compose down
docker-compose up -d
```

2. **Set file permissions**
```bash
chmod 600 .env
chmod 700 docker/ssl/
```

3. **Monitor logs for attacks**
```bash
docker-compose logs nginx | grep -i "suspicious\|error\|warning"
```

4. **Rate limiting verification**
```bash
# Test rate limiting
for i in {1..200}; do curl -s http://localhost/api/courses & done
```

## Maintenance Tasks

### Weekly
- Review error logs
- Check disk usage
- Verify backups

### Monthly
- Update dependencies
- Security audit
- Performance review
- Database optimization

### Quarterly
- Full system backup
- Disaster recovery drill
- Security penetration test

---

For production support, see `docs/SUPPORT.md`
