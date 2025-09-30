# ---- Base image ----
FROM node:20-slim

# Install ffmpeg (and certs for HTTPS). Keep the layer small.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Workdir inside the container
WORKDIR /app

# Copy lockfiles first for better Docker layer caching
# (COPY will ignore files excluded by .dockerignore)
COPY package*.json ./

# Set environment early (used by npm ci below)
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

# Install production deps
# Falls back to `npm install` if there's no lockfile
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

# Copy the rest of your source
COPY . .

# Environment used by your code
# DOWNLOAD_ROOT: where your downloader writes temp files on Railway
# FFMPEG_PATH: explicit path to the ffmpeg binary we installed
ENV DOWNLOAD_ROOT=/tmp \
    FFMPEG_PATH=/usr/bin/ffmpeg

# Run as non-root for safety
# USER node

# If your app exposes an HTTP port, optionally uncomment:
# EXPOSE 3000

# Start the app:
# - If you have "start": "node index.js" (or similar) in package.json, this is perfect.
# - If you *don't* have an npm start script, replace this with:  CMD ["node", "index.js"]
CMD ["npm", "start"]
