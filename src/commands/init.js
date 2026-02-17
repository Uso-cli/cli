const os = require('os');
const shell = require('shelljs');
const { log, spinner } = require('../utils/logger');
const { installWindows } = require('../platforms/windows');
const { installMacOS } = require('../platforms/macos');
const { installLinux } = require('../platforms/linux');
const { getCargoBinPath } = require('../utils/paths');
const { checkRust, checkSolana, checkAnchor } = require('./doctor');
const { ensureWalletInteractive } = require('../utils/wallet');
const path = require('path');
const fs = require('fs');

const init = async (component) => {
    const platform = os.platform();

    if (component) {
        component = component.toLowerCase();
        log.info(`🎯 Targeted installation: ${component}`);

        if (component === 'rust') {
            if (checkRust(true)) {
                log.success("✅ Rust is already installed.");
                return;
            }
            log.info("🦀 Installing Rust...");
            let success = false;
            if (platform === 'win32') success = await installWindows(true, false);
            else if (platform === 'darwin') success = await installMacOS(true, false);
            else success = await installLinux(true, false);

            if (success) log.success("✅ Rust installed successfully.");
            else log.error("❌ Rust installation failed.");
            return;
        }

        if (component === 'solana') {
            if (checkSolana(true)) {
                log.success("✅ Solana CLI is already installed.");
                return;
            }
            log.info("☀️ Installing Solana CLI...");
            let success = false;
            if (platform === 'win32') success = await installWindows(false, true);
            else if (platform === 'darwin') success = await installMacOS(false, true);
            else success = await installLinux(false, true);

            if (success) log.success("✅ Solana CLI installed successfully.");
            else log.error("❌ Solana CLI installation failed.");
            return;
        }

        if (component === 'anchor') {
            if (checkAnchor(true)) {
                log.success("✅ Anchor is already installed.");
                return;
            }
            // Fall through to Anchor installation logic below, but skip others
        } else if (component !== 'anchor') { // If it's not rust, solana, or anchor
            log.error(`❌ Unknown component: ${component}. Available: rust, solana, anchor`);
            return;
        }
    }

    // --- FULL INSTALLATION / ANCHOR ONLY FLOW ---

    // If authenticating for just Anchor, we assume Rust/Solana are prerequisites or we skip them
    let installRust = !checkRust(true);
    let installSolana = !checkSolana(true);
    const hasAnchor = checkAnchor(true);

    if (component === 'anchor') {
        // ensuring prerequisites for anchor
        if (installRust) {
            log.warn("⚠️  Rust is required for Anchor but not installed.");
            // asking or just failing? For granular, let's just fail or warn.
            // But let's proceed to install Anchor logic which handles cargo check
        }
        installRust = false; // Don't run platform installers for these
        installSolana = false;
    }

    // Validating state for full install
    if (!component && !installRust && !installSolana && hasAnchor) {
        log.success("🎉 Everything is already installed!");
        await ensureWalletInteractive();
        return;
    }

    if (!component) {
        log.header("🔍 Checking current environment state...");
        log.info(`\n📦 Missing components:`);
        if (installRust) log.error(" - Rust");
        if (installSolana) log.error(" - Solana CLI");
        if (!hasAnchor) log.error(" - Anchor");
        console.log("");

        const spin = spinner('Starting Installation...').start();

        try {
            let success = false;

            if (platform === 'win32') {
                spin.stop();
                success = await installWindows(installRust, installSolana);
            } else if (platform === 'darwin') {
                spin.stop();
                success = await installMacOS(installRust, installSolana);
            } else {
                spin.stop();
                success = await installLinux(installRust, installSolana);
            }

            if (!success) {
                log.error("❌ Platform-specific installation failed.");
                return;
            }
        } catch (e) {
            spin.stop();
            log.error(e.message);
            return;
        }
    }

    // Install Anchor (Universal) - Runs if component='anchor' OR full install
    if (!hasAnchor && (!component || component === 'anchor')) {
        log.info("⚓ Installing Anchor Framework...");

        const cargoBin = getCargoBinPath();
        const cargoExe = platform === 'win32' ? 'cargo.exe' : 'cargo';
        const avmExe = platform === 'win32' ? 'avm.exe' : 'avm';

        // Resolve cargo command
        let cargoCmd = cargoExe;
        if (fs.existsSync(path.join(cargoBin, cargoExe))) {
            cargoCmd = `"${path.join(cargoBin, cargoExe)}"`;
        } else if (!installRust && checkRust(true)) {
            cargoCmd = 'cargo';
        }

        log.subHeader(`Using cargo: ${cargoCmd}`);

        // Try installing AVM first (Preferred)
        log.info("   Attempting AVM install...");
        const avmInstall = shell.exec(`${cargoCmd} install --git https://github.com/coral-xyz/anchor avm --locked --force`);

        if (avmInstall.code === 0) {
            // Use AVM
            let avmCmd = avmExe;
            if (fs.existsSync(path.join(cargoBin, avmExe))) {
                avmCmd = `"${path.join(cargoBin, avmExe)}"`;
            }

            log.subHeader(`Using avm: ${avmCmd}`);
            const avmUse = shell.exec(`${avmCmd} install latest`);

            // Detect Permission Error for AVM
            if (avmUse.code !== 0) {
                const output = avmUse.stderr + avmUse.stdout;
                if (output.includes("os error 1314") && platform === 'win32') {
                    log.warn("⚠️  AVM Permission denied (Symlink creation failed).");
                    log.info("🛡️  Triggering Run as Administrator (UAC) for Anchor...");
                    const absAvmPath = path.join(cargoBin, avmExe);
                    const elevateCmd = `powershell -Command "Start-Process -FilePath '${absAvmPath}' -ArgumentList 'install latest' -Verb RunAs -Wait; Start-Process -FilePath '${absAvmPath}' -ArgumentList 'use latest' -Verb RunAs -Wait"`;
                    const elevatedRun = shell.exec(elevateCmd);

                    if (elevatedRun.code === 0) {
                        log.success("✅ Anchor installed (Elevated).");
                    } else {
                        log.error("❌ Elevated installation failed. Trying fallback...");
                        fallbackDirectInstall(cargoCmd);
                    }

                } else {
                    log.warn("⚠️  AVM installation failed. Trying fallback...");
                    fallbackDirectInstall(cargoCmd);
                }
            } else {
                shell.exec(`${avmCmd} use latest`);
                log.success("✅ Anchor installed.");
            }
        } else {
            log.error("❌ Failed to install AVM via Cargo.");
            return;
        }
    } else if (component === 'anchor' && hasAnchor) {
        log.success("✅ Anchor is already installed.");
    }


    if (!component) {
        log.header('\n✅ Uso Setup Complete!');
        await ensureWalletInteractive();

        if (installRust || installSolana || !hasAnchor) {
            log.warn('👉 Please RESTART your terminal/VS Code to ensure all PATH variables are updated.');
        }
        log.info('🚀 Try running: uso verify');
    }
};

const fallbackDirectInstall = (cargoCmd) => {
    log.info("👉 Falling back to direct 'anchor-cli' installation...");
    const directInstall = shell.exec(`${cargoCmd} install --git https://github.com/coral-xyz/anchor anchor-cli --locked --force`);
    if (directInstall.code !== 0) {
        log.error("❌ Failed to install Anchor via fallback method.");
    } else {
        log.success("✅ Anchor installed (Direct Cargo).");
    }
};

module.exports = { init };
