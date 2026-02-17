const os = require('os');
const shell = require('shelljs');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { log } = require('./logger');

const resolveSolanaKeygen = () => {
    // 1. Try PATH first
    if (shell.which('solana-keygen')) return 'solana-keygen';

    // 2. Try default Windows path
    if (os.platform() === 'win32') {
        const home = os.homedir();
        const defaultPath = path.join(home, '.local', 'share', 'solana', 'install', 'active_release', 'bin', 'solana-keygen.exe');
        if (fs.existsSync(defaultPath)) return `"${defaultPath}"`;
    }

    // Fallback
    return 'solana-keygen';
};

/**
 * Checks for wallet and prompts user to create one if missing.
 * Returns true if wallet exists (or was created), false if user declined.
 */
const ensureWalletInteractive = async () => {
    const walletDir = path.join(os.homedir(), '.config', 'solana');
    const walletPath = path.join(walletDir, 'id.json');

    if (fs.existsSync(walletPath)) {
        log.info("🔑 Wallet found.");
        return true;
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        log.info("");
        log.warn("⚠️  No Solana wallet found.");
        rl.question("👉 Do you want to generate a new Solana wallet? [y/N] ", (answer) => {
            rl.close();
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                log.info("🔑 Generating wallet...");
                if (!fs.existsSync(walletDir)) fs.mkdirSync(walletDir, { recursive: true });

                const keygenCmd = resolveSolanaKeygen();

                // Use spawnSync to allow interactive input (passphrase)
                const { spawnSync } = require('child_process');

                // We need to strip quotes for spawn
                let cmd = keygenCmd;
                if (cmd.startsWith('"') && cmd.endsWith('"')) cmd = cmd.slice(1, -1);

                try {
                    // We use 'new' command which might prompt for passphrase
                    spawnSync(cmd, ['new', '--outfile', walletPath], { stdio: 'inherit', shell: true });

                    if (fs.existsSync(walletPath)) {
                        log.success("✅ Wallet generated.");
                        resolve(true);
                    } else {
                        // User might have cancelled via Ctrl+C in the subprocess
                        log.warn("❌ Creation cancelled or failed.");
                        resolve(false);
                    }
                } catch (e) {
                    log.error("❌ Failed to generate wallet: " + e.message);
                    resolve(false);
                }
            } else {
                log.info("   Skipping wallet generation.");
                resolve(false);
            }
        });
    });
};

module.exports = {
    resolveSolanaKeygen,
    ensureWalletInteractive
};
