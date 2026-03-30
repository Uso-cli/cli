const shell = require('shelljs');
const { log } = require('../utils/logger');

const installLinux = async (shouldInstallRust, shouldInstallSolana) => {
    log.header("🐧 Linux detected.");

    // 1. Install dependencies
    if (shouldInstallRust || shouldInstallSolana) {
        log.info("🐧 Checking Linux dependencies (libudev, pkg-config)...");
        if (shell.which('apt-get')) {
            shell.exec('sudo apt-get update && sudo apt-get install -y libudev-dev pkg-config build-essential');
        } else if (shell.which('dnf')) {
            shell.exec('sudo dnf install -y systemd-devel pkgconf-pkg-config @development-tools');
        } else if (shell.which('yum')) {
            shell.exec('sudo yum install -y systemd-devel pkgconfig @development-tools');
        } else if (shell.which('pacman')) {
            shell.exec('sudo pacman -Sy --noconfirm systemd pkgconf base-devel');
        } else {
            log.warn("⚠️  Could not detect a supported package manager (apt/dnf/yum/pacman). Ensure libudev and pkg-config are installed.");
        }
    }

    // 2. Install Rust
    if (shouldInstallRust) {
        log.info("🦀 Installing Rust...");
        const rustInstall = shell.exec('curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y');
        if (rustInstall.code !== 0) {
            log.error("❌ Failed to install Rust.");
            return false;
        }
        log.success("✅ Rust installed.");
    } else {
        log.info("🦀 Rust is already installed. Skipping.");
    }

    // 3. Install Solana CLI
    if (shouldInstallSolana) {
        log.info("☀️ Installing Solana CLI...");
        const solanaInstall = shell.exec('sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"');
        if (solanaInstall.code !== 0) {
            log.error("❌ Failed to install Solana CLI.");
            return false;
        }
        log.success("✅ Solana CLI installed.");
    } else {
        log.info("☀️ Solana CLI is already installed. Skipping.");
    }

    return true;
};

module.exports = { installLinux };
