FROM node:24-bookworm AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:24-bookworm AS prod

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY --from=builder /app/build /app/build

RUN npm ci --omit=dev

ENTRYPOINT [ "node", "build/app.js" ]
