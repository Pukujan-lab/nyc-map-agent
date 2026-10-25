# Portable image: builds the SPA and runs the Hono server (API + static files).
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Public, build-time values only. Server secrets are supplied at runtime.
ARG VITE_DATA_BACKEND=octo
ARG MAPILLARY_TOKEN=""
# The commit being built, for asset-manifest.json (the image has no .git).
ARG GIT_SHA=""
ENV VITE_DATA_BACKEND=$VITE_DATA_BACKEND
ENV MAPILLARY_TOKEN=$MAPILLARY_TOKEN
ENV GIT_SHA=$GIT_SHA
RUN pnpm exec vite build
ENV PORT=8080
EXPOSE 8080
CMD ["pnpm", "start"]
