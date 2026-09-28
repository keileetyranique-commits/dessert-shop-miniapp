FROM mirror.gcr.io/library/node:16.20.2-bullseye-slim AS build
WORKDIR /src
COPY vendor/siam-server/vue-siam-shop/ ./
COPY deploy/siam/adapt-build.mjs /adapt-build.mjs
COPY deploy/siam/package-lock.json /baseline-package-lock.json
RUN node /adapt-build.mjs /src && cp /baseline-package-lock.json package-lock.json && npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund
RUN ./node_modules/.bin/webpack --mode=production --hide-modules

FROM mirror.gcr.io/library/node:22-alpine
WORKDIR /baseline
COPY --from=build /src/dist/ ./public/
COPY vendor/siam-server/vue-siam-shop/static/ ./public/static/
COPY deploy/siam/fixtures.mjs deploy/siam/server.mjs ./
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
