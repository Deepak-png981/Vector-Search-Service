FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

RUN npm prune --production

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

VOLUME /app/work

ENV NODE_ENV=production
ENV TEMP_DIR=/app/work

EXPOSE 3000

CMD ["node", "dist/index.js"]