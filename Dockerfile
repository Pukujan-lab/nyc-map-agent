# Portable image: builds the SPA and runs the Hono server (API + static files).
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec vite build
ENV PORT=8080
EXPOSE 8080
CMD ["pnpm", "start"]
