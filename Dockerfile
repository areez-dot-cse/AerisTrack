FROM node:22-alpine

WORKDIR /app

# pg_isready and psql let the startup script wait for Postgres before it
# migrates and seeds the database.
RUN apk add --no-cache postgresql-client

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
COPY docker/entrypoint.sh /usr/local/bin/tna-entrypoint
RUN chmod +x /usr/local/bin/tna-entrypoint

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["tna-entrypoint"]
CMD ["node", "src/server.js"]
