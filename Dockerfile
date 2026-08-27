# syntax=docker/dockerfile:1.5

FROM oven/bun:1.3.6-alpine AS base
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY tsconfig.json tsconfig.json
COPY tailwind.config.ts tailwind.config.ts
COPY postcss.config.mjs postcss.config.mjs
COPY next.config.mjs next.config.mjs
COPY eslint.config.mjs eslint.config.mjs
COPY app app
COPY components components
COPY lib lib
COPY clearurls-rules.json clearurls-rules.json
COPY data.json data.json
COPY public public

FROM base AS build
ARG NEXT_PUBLIC_WEBSITE_URL
ENV NODE_ENV=production
ENV NEXT_PUBLIC_WEBSITE_URL=${NEXT_PUBLIC_WEBSITE_URL}
RUN --mount=type=cache,target=/app/.next/cache \
    bun run build

FROM oven/bun:1.3.6-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

COPY --chown=bun:bun --from=build /app/public ./public
COPY --chown=bun:bun --from=build /app/.next/standalone ./
COPY --chown=bun:bun --from=build /app/.next/static ./.next/static
COPY --chown=bun:bun --from=base /app/clearurls-rules.json ./clearurls-rules.json
COPY --chown=bun:bun --from=base /app/data.json ./data.json

USER bun

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "--spider", "-q", "http://127.0.0.1:3000/"]

CMD ["bun", "server.js"]
