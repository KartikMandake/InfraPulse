# ==============================================================================
# InfraPulse Backend - Production Dockerfile
# Multi-stage, lean, non-root Node.js Alpine image
# ==============================================================================

# Build & Dependency Stage
FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Production Runtime Stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install wget for lightweight healthcheck
RUN apk add --no-cache wget

# Create non-root application directory
COPY --chown=node:node package*.json ./
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node src/ ./src/

# Switch to standard unprivileged node user
USER node

EXPOSE 5000

# Healthcheck checking liveness endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health/live || exit 1

CMD ["node", "src/server.js"]

