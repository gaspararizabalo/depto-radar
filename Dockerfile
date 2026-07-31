# Alternativa a render.yaml para hosts que piden contenedor (Fly.io, Railway).
# Render no lo necesita: con el Blueprint alcanza.
FROM node:22-alpine

WORKDIR /app

# Se copia todo junto porque es un monorepo con workspaces: npm necesita ver los
# package.json de los tres paquetes para resolver el link a @drecksau/engine.
COPY . .

RUN npm install && npm run build

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Un solo proceso sirve el cliente estatico y el WebSocket en el mismo puerto.
CMD ["node", "apps/server/dist/index.js"]
