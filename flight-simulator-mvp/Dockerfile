# Dockerfile para el servidor
FROM node:18-alpine

WORKDIR /app

# Copiar package.json del servidor
COPY server/package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código del servidor
COPY server/ ./

# Exponer puerto
EXPOSE 8080

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=8080

# Comando para iniciar
CMD ["npm", "start"]