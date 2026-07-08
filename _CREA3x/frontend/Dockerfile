# CREA3 frontend — build with Vite, serve with nginx (also proxies /api -> backend)
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time configuration (baked into the static bundle).
# Single-origin setup: the SPA calls /api on this same origin (nginx proxies it),
# and reaches Keycloak on this same origin too (nginx proxies /realms).
# So VITE_API_BASE is empty and VITE_KEYCLOAK_URL == the app's public origin.
ARG VITE_API_BASE=""
ARG VITE_KEYCLOAK_URL="http://localhost:3000"
ARG VITE_KEYCLOAK_REALM="crea"
ARG VITE_KEYCLOAK_CLIENT_ID="crea-frontend"
ARG VITE_KEYCLOAK_ACCOUNT_URL=""
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL \
    VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM \
    VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID \
    VITE_KEYCLOAK_ACCOUNT_URL=$VITE_KEYCLOAK_ACCOUNT_URL

RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine
RUN apk add --no-cache curl
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD curl -fsS http://localhost/ || exit 1
