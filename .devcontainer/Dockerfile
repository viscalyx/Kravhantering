# Cross-platform devcontainer base image
# Supports both AMD64 (Intel/AMD) and ARM64 (Apple Silicon)
# Includes: git, curl, wget, sudo, zsh, and the vscode user
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

# Install system dependencies needed for npm native modules (node-gyp)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        python3 && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /workspace

# Configure git for the workspace (security requirement)
RUN git config --system --add safe.directory /workspace

# Expose the ports that Next.js, Wrangler, Playwright, and Vitest typically use
EXPOSE 3000 3001 4443 8787 9323 51204

# Keep container running (remoteUser in devcontainer.json handles user switching)
CMD ["sleep", "infinity"]
