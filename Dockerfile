# Etapa 1: compilar el frontend
FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Etapa 2: imagen final (Alpine: Coolify comprueba la salud con shell y wget)
FROM node:24-alpine
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY hardhat.config.js ./
COPY contracts ./contracts
COPY src ./src
COPY sql ./sql
COPY servidor ./servidor
# Compila el contrato al construir la imagen (descarga el compilador 0.8.34)
RUN npx hardhat compile
COPY --from=web /web/dist ./web-dist
RUN chown -R node:node /app
ENV TZ=America/Bogota NODE_ENV=production WEB_DIR=/app/web-dist PORT=8080 HARDHAT_DISABLE_TELEMETRY_PROMPT=true
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "servidor/index.js"]
