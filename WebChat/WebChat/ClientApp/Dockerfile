# Vite dev server for the WebChat SPA.
# Vite 6 supports Node ^18 || ^20 || >=22; the old react-scripts 3.x Node 16 pin is gone.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first so this layer is cached across source edits.
COPY WebChat/ClientApp/package.json WebChat/ClientApp/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Application source. Only ClientApp is needed - the .NET solution is irrelevant here.
COPY WebChat/ClientApp/ ./

EXPOSE 3000

# vite.config.js sets host:true and strictPort:3000, so the API container can reach
# this by service name.
CMD ["npm", "run", "dev"]
