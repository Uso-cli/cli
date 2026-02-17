const shell = require('shelljs');
const { log } = require('../utils/logger');

const installLinux = async (shouldInstallRust, shouldInstallSolana) => {
    log.header("🐧 Linux detected.");

    // 1. Install dependencies (Quick check, or just run update? 'update' is harmless mostly)
    // We can assume if Rust/Solana are missing, deps might be too. 
    // If both are present, we might skip this? For safety, we only run if installing something.
    if (shouldInstallRust || shouldInstallSolana) {
        log.info("🐧 Checking Linux dependencies (libudev, pkg-config)...");
        shell.exec('sudo apt-get update && sudo apt-get install -y libudev-dev pkg-config build-essential');
    }

    // 2. Install Rust
    if (shouldInstallRust) {
        log.info("🦀 Installing Rust...");
        shell.exec('curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y');
        log.success("✅ Rust installed.");
    } else {
        log.info("🦀 Rust is already installed. Skipping.");
    }

    // 3. Install Solana CLI
    if (shouldInstallSolana) {
        log.info("☀️ Installing Solana CLI...");
        shell.exec('sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"');
        log.success("✅ Solana CLI installed.");
    } else {
        log.info("☀️ Solana CLI is already installed. Skipping.");
    }

    return true;
};

module.exports = { installLinux };
