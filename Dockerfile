FROM node:22-slim

WORKDIR /app

# Deps first: this layer rebuilds only when package.json/lock change, so ordinary
# source pushes reuse the cached npm ci.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# blitz.cloud: turn ON "Runs in the background" for this app. It then gets no
# address and no port, is never probed, and never sleeps. The HTTP server in
# src/healthserver.js stays up harmlessly for local debug, and you can give it an
# address later with "Give it one" on the Settings tab.
CMD ["node", "src/index.js"]