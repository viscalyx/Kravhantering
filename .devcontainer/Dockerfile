# Cross-platform devcontainer base image
# Supports both AMD64 (Intel/AMD) and ARM64 (Apple Silicon)
# Includes: git, curl, wget, sudo, zsh, and the vscode user
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

# cSPell:ignore mkcert socat bubblewrap
# Install system dependencies needed for npm native modules (node-gyp).
# socat is used by the devcontainer postStartCommand to forward
# 127.0.0.1:8080 inside this container to the Keycloak container
# (idp:8080) so server-side OIDC discovery from Next.js can reach the
# IdP through the same `localhost:8080` URL the host browser uses.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        bubblewrap \
        python3 \
        python3-yaml \
        ripgrep \
        socat \
        sqlite3 \
        mkcert && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /workspace

# Configure git for the workspace (security requirement)
RUN git config --system --add safe.directory /workspace

# Expose the ports that Next.js, Playwright, and Vitest use
EXPOSE 3000 3001 4443 9323 51204

# Keep container running (remoteUser in devcontainer.json handles user switching)
CMD ["sleep", "infinity"]
