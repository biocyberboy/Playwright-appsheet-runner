# Base image with Node.js and Playwright browsers preinstalled
FROM mcr.microsoft.com/playwright:v1.47.1-jammy

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --no-fund --no-audit || npm i --no-fund --no-audit

# Copy the rest of the project
COPY . .

# Default API port
ENV PORT=9323
EXPOSE 9323

# Optional healthcheck against /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "require('http').request({host:'127.0.0.1',port:process.env.PORT||9323,path:'/health'},res=>process.exit(res.statusCode===200?0:1)).on('error',()=>process.exit(1)).end()"

# Start the API server
CMD ["npm","run","api"]

