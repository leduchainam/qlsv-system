FROM node:18-alpine

# Add a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create application log directory with non-root ownership
RUN mkdir -p /var/log/app && chown -R appuser:appgroup /var/log/app

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# Change ownership to non-root user
RUN chown -R appuser:appgroup /usr/src/app

# Switch to non-root user
USER appuser

EXPOSE 3000
CMD [ "npm", "start" ]
