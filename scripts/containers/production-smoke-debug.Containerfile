# check=skip=InvalidDefaultArgInFrom

# The debug command supplies the required reference from the devcontainer lock.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}

ENV container=docker

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
      aardvark-dns \
      ca-certificates \
      curl \
      dbus-user-session \
      fuse-overlayfs \
      iptables \
      jq \
      libnss3-tools \
      netavark \
      podman \
      slirp4netns \
      sudo \
      systemd \
      systemd-sysv \
      uidmap && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

STOPSIGNAL SIGRTMIN+3

CMD ["/sbin/init"]
