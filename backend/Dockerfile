# Build context is the REPO ROOT (the pnpm lockfile lives there):
#   docker build -f backend/Dockerfile .
# Debian (glibc), not Alpine: the local embedding model runs on onnxruntime-node, which ships glibc binaries only.
FROM node:22-bookworm-slim AS build
RUN npm install -g pnpm@11.13.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter backend... \
 && pnpm --filter backend build \
 && pnpm --filter backend deploy --prod /app

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    FASTIFY_ADDRESS=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
# The scraped corpus (data/*.json) ships with the image; data/runtime is created at startup.
COPY --from=build --chown=node:node /repo/backend/data ./data
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
# Run as the unprivileged "node" user, never root.
USER node
EXPOSE 3000
CMD ["node_modules/.bin/fastify", "start", "-o", "-l", "info", "dist/app.js"]
