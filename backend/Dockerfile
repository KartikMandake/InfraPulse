# ==============================================================================
# InfraPulse Backend - Production Dockerfile
# Multi-stage, lean, non-root Node.js Alpine image
# ==============================================================================

# Build & Dependency Stage
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Production Runtime Stage
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV NODE_OPTIONS=--max-old-space-size=384

# Create non-root application directory
COPY --chown=node:node package*.json ./
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node src/ ./src/

# Switch to standard unprivileged node user
USER node

EXPOSE 5000

# Healthcheck checking liveness endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health/live',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

STOPSIGNAL SIGTERM
CMD ["node", "src/entrypoint.js", "server"]

