FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

# Source is mounted at runtime for live-reload; this layer is a fallback.
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
