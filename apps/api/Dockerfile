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

# node_modules with generated prisma client
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./

# compiled app, prisma, and PUBLIC assets
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public 

EXPOSE 3000
CMD ["npm", "start"]

