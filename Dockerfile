FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Use non-root user (node image provides 'node')
USER node

ENV NODE_ENV=production
EXPOSE 3000

# Start the server
CMD ["node", "backend/server.js"]
