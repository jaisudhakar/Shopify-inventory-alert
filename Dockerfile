FROM node:22-alpine

EXPOSE 3000
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
# Dev dependencies are needed to build, then pruned out of the final image.
RUN npm ci --include=dev

COPY . .

RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

CMD ["npm", "run", "docker-start"]
