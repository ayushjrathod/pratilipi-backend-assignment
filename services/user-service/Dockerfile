FROM node:20.13.1-bookworm-slim

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

COPY . .

ENV PORT=8000
ENV METRICS_PORT=9201

EXPOSE $PORT
EXPOSE $METRICS_PORT

CMD ["npx", "ts-node", "src/index.ts"]
