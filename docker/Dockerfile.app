FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY backend ./backend
EXPOSE 3000
CMD ["node", "backend/server.js"]
