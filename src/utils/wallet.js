const os = require('os');
const shell = require('shelljs');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { log } = require('./logger');
const { isStealthMode } = require('./stealth');
const { runWsl } = require('./wsl-bridge');

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
    const stealth = isStealthMode();
    
    // When in stealth mode, wallet is in WSL home
    let walletDir, walletPath;
    if (stealth.enabled) {
        walletDir = '$HOME/.config/solana';
        walletPath = '$HOME/.config/solana/id.json';
    } else {
        walletDir = path.join(os.homedir(), '.config', 'solana');
        walletPath = path.join(walletDir, 'id.json');
    }

    // Check if wallet exists
    if (stealth.enabled) {
        // Check inside WSL
        const checkWallet = runWsl('test -f $HOME/.config/solana/id.json && echo "exists"', { distro: stealth.distro });
        if (checkWallet.code === 0 && checkWallet.stdout.includes('exists')) {
            log.info("🔑 Wallet found (in WSL).");
            return true;
        }
    } else {
        if (fs.existsSync(walletPath)) {
            log.info("🔑 Wallet found.");
            return true;
        }
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
                
                try {
                    if (stealth.enabled) {
                        // Create wallet inside WSL
                        const mkdirCmd = 'mkdir -p $HOME/.config/solana';
                        runWsl(mkdirCmd, { distro: stealth.distro });
                        
                        // Run solana-keygen inside WSL with interactive mode
                        const { spawnSync } = require('child_process');
                        const wslCmd = `wsl -d ${stealth.distro} -e bash -c "solana-keygen new --outfile \\$HOME/.config/solana/id.json"`;
                        spawnSync('cmd.exe', ['/c', wslCmd], { stdio: 'inherit' });
                        
                        // Verify wallet was created in WSL
                        const verifyCmd = runWsl('test -f $HOME/.config/solana/id.json && echo "exists"', { distro: stealth.distro });
                        if (verifyCmd.code === 0 && verifyCmd.stdout.includes('exists')) {
                            log.success("✅ Wallet generated (in WSL).");
                            resolve(true);
                        } else {
                            log.warn("❌ Creation cancelled or failed.");
                            resolve(false);
                        }
                    } else {
                        // Create wallet natively on Windows
                        if (!fs.existsSync(walletDir)) fs.mkdirSync(walletDir, { recursive: true });

                        const keygenCmd = resolveSolanaKeygen();

                        // Use spawnSync to allow interactive input (passphrase)
                        const { spawnSync } = require('child_process');

                        // We need to strip quotes for spawn
                        let cmd = keygenCmd;
                        if (cmd.startsWith('"') && cmd.endsWith('"')) cmd = cmd.slice(1, -1);

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
