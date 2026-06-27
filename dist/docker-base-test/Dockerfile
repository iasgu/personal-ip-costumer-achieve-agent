FROM redis:7-alpine
RUN apk add --no-cache nodejs npm
RUN node -v && npm -v
CMD ["node","-e","console.log('ok')"]
