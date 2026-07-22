# Cross-platform devcontainer base image
# Supports both AMD64 (Intel/AMD) and ARM64 (Apple Silicon)
# Includes: git, curl, wget, sudo, zsh, and the vscode user
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG LYCHEE_VERSION=v0.24.2

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

# Install the Codex CLI system-wide for both devcontainer profiles. Keep the
# standalone package outside root's home so the vscode user can execute it.
RUN mkdir -p /usr/local/lib/codex && \
    curl -fsSL https://chatgpt.com/codex/install.sh | \
    CODEX_HOME=/usr/local/lib/codex \
    CODEX_INSTALL_DIR=/usr/local/bin \
    CODEX_NON_INTERACTIVE=1 \
    sh && \
    codex --version

# Install dotenv-linter for env file checks.
RUN curl -sSfL https://raw.githubusercontent.com/dotenv-linter/dotenv-linter/master/install.sh | \
    sh -s -- -b /usr/local/bin

# Install pinned Lychee for local Markdown link checks; verify the release
# archive before extracting it.
RUN set -eux; \
    case "$(dpkg --print-architecture)" in \
      amd64) \
        lychee_target='x86_64-unknown-linux-gnu'; \
        lychee_sha256='1f4e0ef7f6554a6ed33dd7ac144fb2e1bbed98598e7af973042fc5cd43951c9a' \
        ;; \
      arm64) \
        lychee_target='aarch64-unknown-linux-gnu'; \
        lychee_sha256='91a7bd65685da41b90ccb9bc867a3d649a7818042dae04ff405e55a25bddee4c' \
        ;; \
      *) echo "Unsupported Lychee architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac; \
    lychee_archive="lychee-${lychee_target}.tar.gz"; \
    curl -fsSLo "/tmp/${lychee_archive}" "https://github.com/lycheeverse/lychee/releases/download/lychee-${LYCHEE_VERSION}/${lychee_archive}"; \
    echo "${lychee_sha256}  /tmp/${lychee_archive}" | sha256sum --check --status; \
    mkdir -p /tmp/lychee; \
    tar -xzf "/tmp/${lychee_archive}" --strip-components=1 -C /tmp/lychee; \
    install -m 0755 /tmp/lychee/lychee /usr/local/bin/lychee; \
    rm -rf "/tmp/${lychee_archive}" /tmp/lychee

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
