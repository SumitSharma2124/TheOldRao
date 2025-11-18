# Production Dockerfile for Old Rao (Render compatible)
# Use Node 20 LTS for stability
FROM node:20-alpine

WORKDIR /app

# Install dependencies separately to leverage Docker layer caching
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source
COPY . .

# Environment defaults (override on Render dashboard)
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port Render will map
EXPOSE 3000

# Healthcheck (optional - Render can use /healthz directly)
# HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
#   CMD wget -qO- http://localhost:3000/healthz || exit 1

# Start the server
CMD ["node","server.js"]
