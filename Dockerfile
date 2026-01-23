# Use ubuntu 22.04 as base image
FROM ubuntu:22.04

SHELL ["/bin/bash", "-c"]

# Set the environment variable to ensure cargo is available in the PATH
ENV PATH="/root/.cargo/bin:${PATH}"

# Install the required packages and Rust
RUN apt update && \
    apt upgrade -y && \
    apt install -y libclang-dev git pkg-config gcc build-essential libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev gcc-multilib curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev && \
    rm -rf /var/cache/apt && \
    # Rust
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    # Node.js
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
    export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" && \
    nvm install 22 && \
    npm install -g pnpm && \
    # Install Rust and Node.js tools
    cargo install cargo-watch && \
    cargo install cargo-run-script && \
    cargo install wasm-pack --git https://git.nextgraph.org/NextGraph/wasm-pack.git --branch master --locked && \
    npm install -g pnpm && \
    # Clone the nextgraph-rs repository (TODO: It might be better to put this into a seperate RUN command to avoid rebuilding the image if the repository changes)
    git clone https://git.nextgraph.org/NextGraph/nextgraph-rs.git && \
    # Build ng-app web version
    cd /nextgraph-rs/ && pnpm buildfront


# Build the nextgraph-rs project and its subprojects
WORKDIR /nextgraph-rs
RUN cargo build -r -p ngd && \
    cargo build -r -p ngcli

# Build sdk
WORKDIR /nextgraph-rs/sdk/js/lib-wasm
RUN cargo run-script node

# Build argument to force cache invalidation for ngScripts COPY
ARG NGSCRIPTS_CACHE_BUST=1

COPY ngScripts /ngScripts

WORKDIR /ngScripts
RUN chmod +x runOrInit
RUN export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && npm install /nextgraph-rs/sdk/js/lib-wasm/pkg-node

WORKDIR /nextgraph-rs

EXPOSE 14400

ENTRYPOINT ["/ngScripts/runOrInit"]

# TODO: Build the platform-specific ng-app versions
# WORKDIR /nextgraph-rs/ng-app
# RUN cargo tauri build --target x86_64-unknown-linux-gnu

# TODO: To remove the image size, remove ~/.cargo, ~/.rustup, and the build dependencies
