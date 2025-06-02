FROM node:20.13.1-bookworm-slim

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

COPY . .

CMD ["npx", "ts-node", "src/index.ts"]
