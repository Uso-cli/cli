const shell = require('shelljs');
const { log } = require('../utils/logger');

const installMacOS = async (shouldInstallRust, shouldInstallSolana) => {
    log.header("🍎 macOS detected.");

    // 1. Install Rust
    if (shouldInstallRust) {
        log.info("🦀 Installing Rust...");
        const rustInstall = shell.exec('curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y');
        if (rustInstall.code !== 0) return false;
        log.success("✅ Rust installed.");
    } else {
        log.info("🦀 Rust is already installed. Skipping.");
    }

    // 2. Install Solana CLI
    if (shouldInstallSolana) {
        log.info("☀️ Installing Solana CLI...");
        const solanaInstall = shell.exec('sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"');
        if (solanaInstall.code !== 0) return false;
        log.success("✅ Solana CLI installed.");
    } else {
        log.info("☀️ Solana CLI is already installed. Skipping.");
    }

    return true;
};

module.exports = { installMacOS };
