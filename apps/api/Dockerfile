# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

# bring in source (this must include /public)
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# ---- runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Run as non-root for safer container defaults
RUN addgroup -S app && adduser -S app -G app

# node_modules with generated prisma client
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./

# compiled app, prisma, and PUBLIC assets
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public 

RUN chown -R app:app /app
USER app

HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" || exit 1

EXPOSE 3000
CMD ["npm", "start"]
