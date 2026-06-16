FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/analytics/package.json ./packages/analytics/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/protocols/package.json ./packages/protocols/
RUN pnpm install --no-frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
COPY --from=deps /app ./
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN apk add --no-cache libreoffice udev ttf-dejavu ttf-freefont ttf-liberation fontconfig \
    && fc-cache -f

# Set the correct permission for prerender cache
RUN mkdir -p apps/web/.next
RUN chown -R nextjs:nodejs apps/web/.next

# Standalone output copies files to /app/apps/web/.next/standalone
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

RUN rm -f apps/web/.env

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
