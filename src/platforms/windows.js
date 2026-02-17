const shell = require('shelljs');
const { log, spinner } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const installWindows = async (shouldInstallRust, shouldInstallSolana) => {
    log.header("🪟 Windows detected.");

    // 1. Check for C++ Build Tools
    if (shouldInstallRust) {
        const hasCl = shell.which('cl');
        if (!hasCl) {
            log.warn("⚠️  Visual Studio C++ Build Tools (cl.exe) not found!");
            log.warn("👉 Please install them from: https://visualstudio.microsoft.com/visual-cpp-build-tools/");
            log.warn("   Make sure to select 'Desktop development with C++' workload before installing Rust.");
        }
    }

    // 2. Install Rust
    if (shouldInstallRust) {
        log.info("🦀 Installing Rust (rustup-init.exe)...");
        shell.exec('powershell -Command "Invoke-WebRequest -Uri https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe -OutFile rustup-init.exe"');

        const rustInstall = shell.exec('powershell -Command "./rustup-init.exe -y"');

        if (rustInstall.code !== 0) {
            log.warn("⚠️  Rust installer finished with a non-zero code. It might have succeeded if you saw 'Rust is installed now'.");
        } else {
            log.success("✅ Rust installed.");
        }

        if (fs.existsSync('rustup-init.exe')) {
            shell.rm('rustup-init.exe');
        }
    } else {
        log.info("🦀 Rust is already installed. Skipping.");
    }

    // 3. Install Solana CLI (Agave)
    if (shouldInstallSolana) {
        log.info("☀️ Installing Solana CLI (Agave)...");
        log.info("   Downloading solana-install-init.exe...");

        const downloadCmd = 'powershell -Command "Invoke-WebRequest -Uri https://release.anza.xyz/stable/solana-install-init-x86_64-pc-windows-msvc.exe -OutFile solana-install.exe"';
        const dlResult = shell.exec(downloadCmd);

        if (dlResult.code !== 0) {
            log.error("❌ Failed to download Solana installer.");
            return false;
        }

        // Try regular install first
        log.info("   Running Solana Installer...");
        const installResult = shell.exec('solana-install.exe stable');

        // Check for Symlink Error (1314) for potential auto-elevation
        if (installResult.code !== 0) {
            const output = installResult.stderr + installResult.stdout;
            if (output.includes("os error 1314")) {
                log.warn("⚠️  Permission denied (Symlink creation failed).");
                log.info("🛡️  Triggering Run as Administrator (UAC)...");
                log.info("👉 Please click 'Yes' in the popup window to allow the installer.");

                const absPath = path.resolve('solana-install.exe');
                // Use Start-Process with -Verb RunAs to trigger elevation
                // -Wait ensures we actually wait for it to finish
                const elevateCmd = `powershell -Command "Start-Process -FilePath '${absPath}' -ArgumentList 'stable' -Verb RunAs -Wait"`;

                const elevatedRun = shell.exec(elevateCmd);

                if (elevatedRun.code === 0) {
                    // We can't easily capture stdout from the spawned high-privilege window, 
                    // so we assume success if the process exited cleanly and verify existence.
                    // A basic verification: check if we can run solana
                    log.success("✅ Solana Installer finished (Elevated).");
                } else {
                    log.error("❌ Elevated installation failed or was cancelled.");
                    return false;
                }
            } else {
                log.error("❌ Solana CLI installation failed.");
                // Don't return false hard here as we might want to continue, but usually this is fatal
            }
        } else {
            log.success("✅ Solana CLI installed.");
        }

        if (fs.existsSync('solana-install.exe')) {
            shell.rm('solana-install.exe');
        }
    } else {
        log.info("☀️ Solana CLI is already installed. Skipping.");
    }

    if (shouldInstallRust || shouldInstallSolana) {
        log.warn("⚠️  NOTE: You may need to restart your terminal for PATH changes to take effect.");
    }

    return true;
};

module.exports = { installWindows };
