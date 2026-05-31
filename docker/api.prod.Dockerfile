FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

COPY . .
RUN npm run build:shared
RUN npm run prisma:generate
RUN npm run build:api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p /app/storage/local/attachments /app/storage/local/exports /app/storage/local/temp
EXPOSE 4000
CMD ["npm", "--workspace", "@avidity/api", "run", "start:prod"]
