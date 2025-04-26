FROM node:20.13.1-bookworm-slim

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

COPY . .

ENV PORT=4000

EXPOSE $PORT

CMD ["npx", "ts-node", "src/index.ts"]
