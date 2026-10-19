# Build the Angular web app on the same Node major as the regression CI.
FROM node:22-bookworm AS build
WORKDIR /usr/src/app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 pkg-config libudev-dev libusb-1.0-0-dev \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY . .
# Angular 13/webpack requires this only during compilation, not in the web server.
RUN NODE_OPTIONS=--openssl-legacy-provider npm run wallet:build

# Only the compiled web assets are included in the runtime image.
FROM nginx:1.30.5-alpine
COPY .docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /usr/src/app/dist /usr/share/nginx/html
