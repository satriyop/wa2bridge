# =============================================================================
# WA2Bridge Dockerfile
# Multi-stage build for minimal production image (~150MB)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dashboard Builder (Vue.js)
# -----------------------------------------------------------------------------
FROM node:18-alpine AS dashboard-builder

WORKDIR /app/dashboard

# Install dependencies first (better caching)
COPY dashboard/package*.json ./
RUN npm ci

# Copy source and build
COPY dashboard/ ./
RUN npm run build

# Output: /app/dashboard/dist

# -----------------------------------------------------------------------------
# Stage 2: Backend Dependencies
# -----------------------------------------------------------------------------
FROM node:18-alpine AS backend-deps

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Output: /app/node_modules (production only)

# -----------------------------------------------------------------------------
# Stage 3: Production Runtime
# -----------------------------------------------------------------------------
FROM node:18-alpine

LABEL org.opencontainers.image.title="wa2bridge"
LABEL org.opencontainers.image.description="WhatsApp Bridge with Anti-Ban Protection"
LABEL org.opencontainers.image.source="https://github.com/satriyo/wa2bridge"

WORKDIR /app

# Install dumb-init for proper signal handling (SIGTERM)
# This ensures graceful shutdown works correctly in containers
RUN apk add --no-cache dumb-init

# Copy production dependencies from Stage 2
COPY --from=backend-deps /app/node_modules ./node_modules

# Copy application source
COPY src/ ./src/
COPY types/ ./types/
COPY package*.json ./

# Copy built dashboard from Stage 1
COPY --from=dashboard-builder /app/dashboard/dist ./dashboard/dist

# Create sessions directory with correct permissions
# Sessions are mounted as a volume at runtime
RUN mkdir -p /app/sessions && \
    chown -R node:node /app/sessions && \
    chown -R node:node /app

# Switch to non-root user (security best practice)
USER node

# Expose API port (default 3000, override via PORT env)
EXPOSE 3000

# Health check for container orchestration
# - interval: Check every 30 seconds
# - timeout: Fail if no response in 10 seconds
# - start_period: Give 60 seconds for WhatsApp connection to establish
# - retries: Allow 3 failures before marking unhealthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "const http = require('http'); const port = process.env.PORT || 3000; http.get('http://localhost:' + port + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use dumb-init as PID 1 to handle signals properly
# This ensures SIGTERM is forwarded to Node.js for graceful shutdown
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start application
CMD ["node", "src/index.js"]
