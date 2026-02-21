const shell = require('shelljs');
const { log, spinner } = require('../utils/logger');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');

const askQuestion = (query) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
};

/**
 * Runs a command and attempts to elevate privileges if it fails with a permission error.
 */
const runOrElevate = (command, description) => {
    // We run without silent:true initially to let the user see output, 
    // but detecting the error code is what matters.
    // actually, to detect the specific string "os error 1314", we need to capture output.
    // So we run silently first? Or we just run and if it fails, we assume it *might* be elevation if on Windows?
    // Let's run synchronously and capture output.

    const result = shell.exec(command, { silent: true });

    if (result.code === 0) {
        console.log(result.stdout);
        return true;
    }

    // Print the error output to the user
    console.log(result.stdout);
    console.error(result.stderr);

    const output = result.stderr + result.stdout;

    // Check for common permission errors
    // "os error 1314" is specific to Windows symlink privilege
    if ((output.includes("os error 1314") || output.includes("EPERM") || output.includes("permission denied")) && os.platform() === 'win32') {
        log.warn(`⚠️  Permission denied during: ${description}`);
        log.info("🛡️  Triggering Run as Administrator (UAC) to retry...");

        // Construct PowerShell command to run cmd /c <command> as admin
        // We need to be careful with quoting.
        const escapedCommand = command.replace(/'/g, "''"); // Basic PowerShell escaping for single quotes
        const elevateCmd = `powershell -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c ${escapedCommand}' -Verb RunAs -Wait"`;

        const elevatedRun = shell.exec(elevateCmd);

        if (elevatedRun.code === 0) {
            log.success(`✅ ${description} completed (Elevated).`);
            return true;
        } else {
            log.error(`❌ Elevated execution failed for: ${description}`);
            return false;
        }
    }

    log.error(`❌ Command failed: ${description}`);
    return false;
};

const uninstall = async (component) => {
    log.header("🗑️  USO Uninstallation & Cleanup");

    if (component) {
        component = component.toLowerCase();
        log.info(`🎯 Targeted uninstallation: ${component}`);

        if (component === 'anchor') {
            const anchorInstalled = shell.which('anchor');
            if (anchorInstalled) {
                log.info("Removing Anchor...");
                // Try avm uninstall first if available
                if (shell.which('avm')) {
                    runOrElevate('avm uninstall latest', 'Uninstall Anchor (AVM)');
                }
                runOrElevate('cargo uninstall anchor-cli', 'Uninstall anchor-cli');
                runOrElevate('cargo uninstall avm', 'Uninstall avm');
                log.success("Anchor removal steps completed.");
            } else {
                log.success("✅ Anchor is not installed.");
            }
            return;
        }

        if (component === 'solana') {
            // Check PATH first
            let solanaInstalled = shell.which('solana');
            const localShareSolana = path.join(os.homedir(), '.local', 'share', 'solana');

            // If not found in PATH, check default location
            if (!solanaInstalled && fs.existsSync(localShareSolana)) {
                solanaInstalled = true;
            }

            if (solanaInstalled) {
                log.info("Removing Solana CLI...");

                if (fs.existsSync(localShareSolana)) {
                    try {
                        fs.rmSync(localShareSolana, { recursive: true, force: true });
                        log.success(`Removed ${localShareSolana}`);
                    } catch (err) {
                        log.warn(`Failed to remove ${localShareSolana} directly: ${err.message}`);
                        log.info("Trying to remove via elevated command...");
                        runOrElevate(`rmdir /s /q "${localShareSolana}"`, `Remove folder ${localShareSolana}`);
                    }
                } else {
                    log.warn(`Could not find Solana folder at ${localShareSolana}. It might be removed already.`);
                }
            } else {
                log.success("✅ Solana CLI is not installed.");
            }
            return;
        }

        if (component === 'rust') {
            const rustInstalled = shell.which('rustc');
            if (rustInstalled) {
                log.info("Running rustup self uninstall...");
                runOrElevate('rustup self uninstall -y', 'Uninstall Rust');
            } else {
                log.success("✅ Rust is not installed.");
            }
            return;
        }

        log.error(`❌ Unknown component: ${component}. Available: rust, solana, anchor`);
        return;
    }

    // --- FULL INTERACTIVE UNINSTALL ---

    log.warn("This process allows you to remove components installed by uso.");
    log.warn("Please be careful, especially with wallet removal!");

    const proceed = await askQuestion("👉 Do you want to proceed with uninstallation? (y/N): ");
    if (proceed.toLowerCase() !== 'y') {
        log.info("Operation cancelled.");
        return;
    }

    // 1. Uninstall Anchor
    const anchorInstalled = shell.which('anchor');
    if (anchorInstalled) {
        const removeAnchor = await askQuestion("\n⚓ Remove Anchor Framework? (y/N): ");
        if (removeAnchor.toLowerCase() === 'y') {
            log.info("Removing Anchor...");
            // Try avm uninstall first if available
            if (shell.which('avm')) {
                runOrElevate('avm uninstall latest', 'Uninstall Anchor (AVM)');
            }
            runOrElevate('cargo uninstall anchor-cli', 'Uninstall anchor-cli');
            runOrElevate('cargo uninstall avm', 'Uninstall avm');
            log.success("Anchor removal steps completed.");
        }
    }

    // 2. Uninstall Solana
    let solanaInstalled = shell.which('solana');
    const localShareSolana = path.join(os.homedir(), '.local', 'share', 'solana');

    // If not found in PATH, check default location (like doctor does)
    if (!solanaInstalled && fs.existsSync(localShareSolana)) {
        solanaInstalled = true;
    }

    if (solanaInstalled) {
        const removeSolana = await askQuestion("\n☀️  Remove Solana CLI? (y/N): ");
        if (removeSolana.toLowerCase() === 'y') {
            log.info("Removing Solana CLI...");

            // Default locations
            // const localShareSolana = path.join(os.homedir(), '.local', 'share', 'solana'); // Already defined

            if (fs.existsSync(localShareSolana)) {
                try {
                    fs.rmSync(localShareSolana, { recursive: true, force: true });
                    log.success(`Removed ${localShareSolana}`);
                } catch (err) {
                    log.warn(`Failed to remove ${localShareSolana} directly: ${err.message}`);
                    log.info("Trying to remove via elevated command...");
                    runOrElevate(`rmdir /s /q "${localShareSolana}"`, `Remove folder ${localShareSolana}`);
                }
            } else {
                log.warn(`Could not find Solana at ${localShareSolana}. It might be already removed.`);
            }
        }
    }

    // 3. Uninstall Rust
    const rustInstalled = shell.which('rustc');
    if (rustInstalled) {
        const removeRust = await askQuestion("\n🦀 Remove Rust? (y/N): ");
        if (removeRust.toLowerCase() === 'y') {
            log.info("Running rustup self uninstall...");
            runOrElevate('rustup self uninstall -y', 'Uninstall Rust');
        }
    }

    // 4. WALLET REMOVAL (DANGER)
    const walletPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
    if (fs.existsSync(walletPath)) {
        log.error("\n⚠️  DANGER ZONE ⚠️");
        log.warn(`Found a Solana wallet at: ${walletPath}`);
        log.warn("If you delete this without a backup, your funds will be LOST FOREVER.");

        const removeWallet = await askQuestion("💥 Do you REALLY want to delete this wallet? (type 'DELETE' to confirm): ");
        if (removeWallet === 'DELETE') {
            try {
                fs.unlinkSync(walletPath);
                log.success("Wallet deleted.");

                // Clean up parent config dir if empty
                const configDir = path.dirname(walletPath);
                try {
                    if (fs.readdirSync(configDir).length === 0) {
                        fs.rmSync(configDir, { recursive: true, force: true });
                    }
                } catch (e) { }
            } catch (err) {
                log.error(`Failed to delete wallet: ${err.message}`);
            }
        } else {
            log.info("Skipping wallet deletion.");
        }
    }

    log.header("\n✅ Cleanup complete.");
    log.info("To remove the 'uso' tool itself, run:");
    log.info("   npm uninstall -g uso");
};

module.exports = { uninstall };
