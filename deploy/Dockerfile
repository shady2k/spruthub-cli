# Context: directory containing sibling spruthub-cli/ and spruthub-client/ worktrees.
FROM node:20-bookworm-slim AS client
WORKDIR /client
COPY spruthub-client/package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY spruthub-client/src ./src
COPY spruthub-client/tests ./tests
COPY spruthub-client/jest.config.js ./
RUN npm test -- --runInBand --coverage=false
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:20-bookworm-slim AS build
WORKDIR /cli
COPY spruthub-cli/package*.json ./
# Collector file credentials never load the optional native keytar binding.
RUN npm ci --ignore-scripts --no-audit --no-fund && rm -rf node_modules/spruthub-client
# Use the tested local source and its own locked production dependencies.
COPY --from=client /client/package.json ./node_modules/spruthub-client/package.json
COPY --from=client /client/src ./node_modules/spruthub-client/src
COPY --from=client /client/node_modules ./node_modules/spruthub-client/node_modules
COPY spruthub-cli/tsconfig.json spruthub-cli/jest.config.cjs spruthub-cli/eslint.config.js ./
COPY spruthub-cli/src ./src
COPY spruthub-cli/bin ./bin
COPY spruthub-cli/tests ./tests
COPY spruthub-cli/deploy/prepare-credentials.mjs ./deploy/prepare-credentials.mjs
RUN npm run build && npm run lint && npm test -- --runInBand --watchman=false && node --test tests/collector/*.mjs

FROM node:20-bookworm-slim AS dependencies
WORKDIR /cli
COPY spruthub-cli/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && rm -rf node_modules/spruthub-client
COPY --from=client /client/package.json ./node_modules/spruthub-client/package.json
COPY --from=client /client/src ./node_modules/spruthub-client/src
COPY --from=client /client/node_modules ./node_modules/spruthub-client/node_modules

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production SPRUTHUB_CREDENTIALS_FILE=/var/run/spruthub/credentials.json
COPY --from=build --chown=node:node /cli/package.json ./
COPY --from=build --chown=node:node /cli/dist ./dist
COPY --from=build --chown=node:node /cli/deploy/prepare-credentials.mjs ./prepare-credentials.mjs
COPY --from=dependencies --chown=node:node /cli/node_modules ./node_modules
USER node
ENTRYPOINT ["node", "dist/bin/spruthub-cli.js"]
CMD ["--format", "json", "log", "list", "--follow", "--lines", "1000"]
