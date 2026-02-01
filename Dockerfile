# Dockerfile for local development
FROM denoland/deno:2.5.1

# Set working directory
WORKDIR /app

# Copy dependency files first (for better caching)
COPY deno.json deno.lock* ./

# Cache dependencies
RUN deno cache --reload deno.json || true

# Copy application code
COPY . .

# Cache the main application
RUN deno cache main.ts

# Expose the port
EXPOSE 3001

# Use entrypoint script to run migrations before starting
ENTRYPOINT ["./docker-entrypoint.sh"]
