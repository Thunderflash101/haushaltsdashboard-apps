FROM node:24-alpine
ENV NODE_ENV=production DATA_DIR=/data
WORKDIR /app
COPY app/ /app/
EXPOSE 8099 8100
CMD ["node", "server.mjs"]

