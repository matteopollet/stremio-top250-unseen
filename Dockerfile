FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=7000 \
    DATA_DIR=/var/lib/top250-unseen
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/data/top250.snapshot.json /app/data/aliases.json ./data/
COPY package.json ./
RUN mkdir -p /var/lib/top250-unseen && chown node:node /var/lib/top250-unseen
USER node
EXPOSE 7000
CMD ["node", "dist/runtime/node.js"]
