FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json server.mjs assignment.mjs ./
COPY public ./public
RUN mkdir -p /app/data

ENV HOST=0.0.0.0
ENV PORT=8780
ENV DATA_DIR=/app/data
EXPOSE 8780

CMD ["node", "server.mjs"]
