FROM redis:7-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8893

RUN apk add --no-cache nodejs npm

COPY package*.json ./
RUN npm install --omit=dev

COPY . ./

EXPOSE 8893

CMD ["npm", "start"]
