# Cross-platform devcontainer base image
# Supports both AMD64 (Intel/AMD) and ARM64 (Apple Silicon)
# Includes: git, curl, wget, sudo, zsh, and the vscode user
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ENV PODMAN_COMPOSE_PROVIDER=podman-compose
# Docker Desktop's Linux VM exposes /dev/fuse, but rootless overlay storage
# inside the nested devcontainer can still fail to execute containers. Use vfs
# for the opt-in local Podman stack; it is slower but predictable.
ENV STORAGE_DRIVER=vfs

# cSPell:ignore certutil fuse fuse-overlayfs libnss mkcert nssdb podman podman-compose slirp4netns socat uidmap venv
# Install system dependencies needed for npm native modules (node-gyp).
# socat is used by the devcontainer postStartCommand to forward
# 127.0.0.1:8080 inside this container to the Keycloak container
# (idp:8080) so server-side OIDC discovery from Next.js can reach the
# IdP through the same `localhost:8080` URL the host browser uses.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        bubblewrap \
        aardvark-dns \
        fuse-overlayfs \
        iptables \
        libnss3-tools \
        netavark \
        podman \
        podman-compose \
        python-is-python3 \
        python3 \
        python3-pip \
        python3-venv \
        python3-yaml \
        ripgrep \
        slirp4netns \
        socat \
        mkcert \
        uidmap && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/vscode/.config/containers && \
    printf '[network]\nnetwork_backend = "netavark"\n' > /home/vscode/.config/containers/containers.conf && \
    chown -R vscode:vscode /home/vscode/.config/containers

# Install dotenv-linter for env file checks.
RUN curl -sSfL https://raw.githubusercontent.com/dotenv-linter/dotenv-linter/master/install.sh | \
    sh -s -- -b /usr/local/bin

# Set the working directory
WORKDIR /workspace

# Configure git for the workspace (security requirement)
RUN git config --system --add safe.directory /workspace

# Expose the ports that Next.js, Playwright, and Vitest use
EXPOSE 3000 3001 4443 9323 51204

# Run the long-lived container process as the same non-root user VS Code uses.
USER vscode

# Keep container running
CMD ["sleep", "infinity"]
