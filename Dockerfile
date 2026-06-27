FROM node:20-alpine

WORKDIR /opt/application

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8000

COPY . .
RUN chmod +x run.sh

EXPOSE 8000

CMD ["./run.sh"]
