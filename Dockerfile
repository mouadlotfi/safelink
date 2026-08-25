# syntax=docker/dockerfile:1.5

FROM oven/bun:1.3.6-alpine AS base
WORKDIR /app

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package.json
COPY bun.lock bun.lock
RUN bun install --frozen-lockfile

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
RUN bun run build

FROM oven/bun:1.3.6-alpine AS production-dependencies
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package.json
COPY bun.lock bun.lock
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.6-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --chown=bun:bun --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=bun:bun --from=base /app/package.json ./package.json
COPY --chown=bun:bun --from=base /app/tailwind.config.ts ./tailwind.config.ts
COPY --chown=bun:bun --from=base /app/postcss.config.mjs ./postcss.config.mjs
COPY --chown=bun:bun --from=base /app/next.config.mjs ./next.config.mjs
COPY --chown=bun:bun --from=build /app/.next ./.next
COPY --chown=bun:bun --from=base /app/clearurls-rules.json ./clearurls-rules.json
COPY --chown=bun:bun --from=base /app/data.json ./data.json
COPY --chown=bun:bun --from=base /app/public ./public

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "--spider", "-q", "http://127.0.0.1:3000/"]

CMD ["bun", "./node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
