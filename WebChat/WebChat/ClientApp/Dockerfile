# Vite dev server for the WebChat SPA.
# Vite 8 requires Node >= 20.19, so the tag here cannot drop back to 18.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first so this layer is cached across source edits.
COPY WebChat/ClientApp/package.json WebChat/ClientApp/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Application source. Only ClientApp is needed - the .NET solution is irrelevant here.
COPY WebChat/ClientApp/ ./

EXPOSE 3000

# vite.config.ts sets host:true, strictPort:3000 and allowedHosts:['react-app'], so the
# API container can reach this by service name.
CMD ["npm", "run", "dev"]
