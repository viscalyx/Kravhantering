FROM node:24-bookworm

ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# cSpell:ignore procps socat dotenv linter
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        bash \
        build-essential \
        ca-certificates \
        curl \
        git \
        openssh-client \
        procps \
        python3 \
        ripgrep \
        socat && \
    rm -rf /var/lib/apt/lists/*

RUN curl -sSfL https://raw.githubusercontent.com/dotenv-linter/dotenv-linter/master/install.sh | \
    sh -s -- -b /usr/local/bin

RUN npx --yes playwright@1.59.1 install --with-deps chromium

RUN git config --system --add safe.directory /workspace

WORKDIR /workspace

CMD ["sleep", "infinity"]
