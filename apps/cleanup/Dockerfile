FROM node:20-alpine
WORKDIR /app

# Install deps (no lockfile needed)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy the tiny app
COPY index.js ./

CMD ["node", "index.js"]
