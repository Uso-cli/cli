const shell = require('shelljs');
const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const { log, spinner } = require('../utils/logger');
const { ensureWalletInteractive, resolveSolanaKeygen } = require('../utils/wallet');
const { getCargoBinPath } = require('../utils/paths');

const getSolanaBin = () => {
    if (shell.which('solana')) return 'solana';
    if (os.platform() === 'win32') {
        const defaultPath = path.join(os.homedir(), '.local', 'share', 'solana', 'install', 'active_release', 'bin', 'solana.exe');
        if (fs.existsSync(defaultPath)) return `"${defaultPath}"`;
    }
    return 'solana';
};

const getAnchorBin = () => {
    if (shell.which('anchor')) return 'anchor';
    return 'anchor';
};

const askBuildConfirmation = async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        log.info("");
        log.info("ℹ️  The next step verifies your toolchain by building a real project.");
        log.warn("⚠️  NOTE: If this is your first time, it will download ~200MB of platform tools.");
        log.warn("   This can take 5-10 minutes depending on your internet.");

        rl.question("👉 Do you want to proceed with the full build verification? [Y/n] ", (answer) => {
            rl.close();
            const a = answer.toLowerCase();
            if (a === 'n' || a === 'no') {
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
};

const verify = async () => {
    log.header("🧪 Verifying Solana Setup...");

    const anchorCmd = getAnchorBin();

    // 1. Check/Create Wallet
    const walletReady = await ensureWalletInteractive();

    if (!walletReady) {
        log.error("❌ Verification cancelled. A wallet is required to build/test.");
        return;
    }

    // Fix PATH for cargo-build-sbf logic (Windows)
    if (os.platform() === 'win32') {
        const solanaBase = path.join(os.homedir(), '.local', 'share', 'solana', 'install');
        const activeRelease = path.join(solanaBase, 'active_release');
        const activeBin = path.join(activeRelease, 'bin');

        let realBin = activeBin;
        try {
            if (fs.existsSync(activeRelease)) {
                const realRelease = fs.realpathSync(activeRelease);
                realBin = path.join(realRelease, 'bin');
            }
        } catch (e) { }

        const pathsToAdd = [activeBin];
        if (realBin !== activeBin) pathsToAdd.push(realBin);

        let pathKey = 'PATH';
        for (const key of Object.keys(process.env)) {
            if (key.toUpperCase() === 'PATH') {
                pathKey = key;
                break;
            }
        }

        let currentPath = process.env[pathKey] || '';
        let modified = false;

        pathsToAdd.forEach(p => {
            if (fs.existsSync(p) && !currentPath.includes(p)) {
                currentPath = `${p};${currentPath}`;
                modified = true;
            }
        });

        if (modified) {
            process.env[pathKey] = currentPath;
            log.success("✅ Solana bin temporarily added to PATH.");
        }
    }

    // 2. Ask for confirmation before building
    const proceed = await askBuildConfirmation();
    if (!proceed) {
        log.info("\n⏭️  Skipping build verification.");
        log.success("✅ Basic tools are installed.");
        log.info("👉 You can run 'npx uso doctor' for a quick version check.");
        return;
    }

    // 3. Build Project
    log.info("🔨 Building verification project...");

    const templateDir = path.resolve(__dirname, '../../anchor_project');
    const tempDir = path.join(os.tmpdir(), 'uso-verification-' + Date.now());

    try {
        shell.cp('-R', templateDir, tempDir);

        let attempts = 0;
        const maxAttempts = 3;
        let success = false;
        let finalError = "";

        while (attempts < maxAttempts && !success) {
            attempts++;
            if (attempts > 1) {
                log.warn(`⚠️  Retrying build (Attempt ${attempts}/${maxAttempts})...`);
            }

            const buildResult = shell.exec(`cd "${tempDir}" && ${anchorCmd} build`, {
                silent: false,
                env: process.env
            });

            success = buildResult.code === 0;
            let stderr = buildResult.stderr + buildResult.stdout;

            if (!success) {
                finalError = stderr;

                if (stderr.includes('TimedOut') || stderr.includes('reqwest::Error') || stderr.includes('Failed to install platform-tools')) {
                    log.warn(`⚠️  Network timeout detected. Retrying...`);
                    continue;
                }

                if (os.platform() === 'win32' && stderr.includes('os error 1314')) {
                    log.warn("⚠️  Privilege error detected (os error 1314).");
                    log.info("ℹ️  First-time Solana build requires Administrator privileges to install tools.");
                    log.info("🛡️  Retrying with Elevated Permissions (Please accept UAC prompt)...");

                    let absAnchor = anchorCmd;
                    if (anchorCmd === 'anchor') {
                        if (shell.which('anchor')) absAnchor = shell.which('anchor').toString();
                        else absAnchor = path.join(getCargoBinPath(), 'anchor.exe');
                    }

                    const psCommand = `cd '${tempDir}'; & '${absAnchor}' build; if ($LASTEXITCODE -ne 0) { Read-Host 'Build Failed. Press Enter to exit...' }`;
                    const elevateCmd = `powershell -Command "Start-Process powershell -ArgumentList \\"-NoExit\\", \\"-Command\\", \\"${psCommand.replace(/"/g, '\\`"')}\\" -Verb RunAs -Wait"`;

                    shell.exec(elevateCmd);

                    const idlPath = path.join(tempDir, 'target', 'idl', 'uso_verifier.json');
                    if (fs.existsSync(idlPath)) {
                        success = true;
                        log.success("✅ Elevated build passed.");
                    } else {
                        log.error("❌ Elevated build failed or was cancelled.");
                        break;
                    }
                } else {
                    break;
                }
            }
        }

        if (success) {
            log.success("✅ Verification Successful!");
            log.success("🎉 Your Solana environment is fully operational.");
            log.info("    - Rust is working");
            log.info("    - Solana CLI is working");
            log.info("    - Anchor is working");
            log.info("    - Wallet is configured");
        } else {
            log.error("❌ Verification Failed.");
        }

    } catch (err) {
        log.error("❌ Verification Error: " + err.message);
    } finally {
        shell.rm('-rf', tempDir);
    }
};

module.exports = { verify };
