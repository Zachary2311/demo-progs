#!/bin/bash

set -e

echo "=== Learning Management System Setup ==="
echo ""

# Check if .env file exists
if [ ! -f lms-system/.env ]; then
    echo "Creating .env file from example..."
    cp lms-system/backend/.env.example lms-system/.env
    echo "⚠️  Please update lms-system/.env with your configuration"
    exit 1
fi

# Load environment variables
export $(cat lms-system/.env | grep -v '#' | xargs)

echo "Installing dependencies..."
cd lms-system/backend
npm install
cd ../frontend
npm install
cd ..

echo "Building Docker images..."
docker-compose build

echo "Starting services..."
docker-compose up -d

echo "Waiting for database to be ready..."
sleep 10

echo "Running database migrations..."
docker-compose exec -T backend npm run db:migrate

echo "Seeding database..."
docker-compose exec -T backend npm run db:seed

echo ""
echo "=== Setup Complete ==="
echo "Frontend: http://localhost:3001"
echo "Backend API: http://localhost:3000/api"
echo "Health check: http://localhost/health"
echo ""
echo "Discord OAuth Configuration:"
echo "- Client ID: $DISCORD_CLIENT_ID"
echo "- Redirect URI: http://localhost/api/auth/discord/callback"
