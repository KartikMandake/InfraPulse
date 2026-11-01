# ==============================================================================
# InfraPulse Frontend - Production Dockerfile
# Multi-stage, unprivileged Nginx container serving Vite React production build
# ==============================================================================

# Build Stage (Debian slim provides glibc native toolchain compatibility for Vite / esbuild)
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN NODE_ENV=production npm run build

# Production Runtime Stage (Unprivileged Nginx on Alpine for minimal attack surface)
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03 AS runner

COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER 101:101

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]
