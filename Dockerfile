FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.output ./.output
COPY drizzle ./drizzle
COPY scripts ./scripts
# SQLite lives on a mounted volume in production (see railway.json / README).
ENV DATABASE_PATH=/data/tabz.db
EXPOSE 3000
# Run node directly so SIGTERM on redeploys reaches the app (npm reports it as a crash).
CMD ["node", "scripts/start.mjs"]
