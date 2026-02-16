# Stage 1: Build the application
FROM node:24-alpine AS builder

ENV TZ=America/Los_Angeles

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# Stage 2: Create the final, minimal image
FROM node:24-alpine

ENV TZ=America/Los_Angeles

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

RUN mkdir -p /app/data && chown nodejs:nodejs /app/data

USER nodejs

CMD ["node", "src/index.js"]
