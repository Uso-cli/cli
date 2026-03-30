const shell = require('shelljs');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { log } = require('../utils/logger');
const { isStealthMode } = require('../utils/stealth');
const { runWsl } = require('../utils/wsl-bridge');

const getStealthContext = () => {
    if (os.platform() !== 'win32') return { enabled: false, distro: 'Ubuntu' };
    return isStealthMode();
};

const runVersionCheck = (tool, stealth) => {
    if (stealth.enabled) {
        // Mirror the init/workflow environment inside WSL.
        const envSetup = 'source $HOME/.cargo/env 2>/dev/null; export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$PATH"';
        return runWsl(`${envSetup} && ${tool} --version`, {
            distro: stealth.distro,
            execOpts: { silent: true }
        });
    }

    return shell.exec(`${tool} --version`, { silent: true });
};

const checkGit = (silent = false) => {
    const installed = !!shell.which('git');
    if (!silent) {
        if (installed) log.success("✅ Git installed");
        else log.error("❌ Git not found");
    }
    return installed;
};

const checkWsl = (silent = false) => {
    // Only relevant on Windows
    if (os.platform() !== 'win32') return true;

    // 1. Check wsl.exe exists
    const hasWslBinary = !!shell.which('wsl');
    if (!hasWslBinary) {
        if (!silent) {
            log.error("❌ WSL not installed");
            log.warn("   👉 Run 'uso install' to automatically install WSL (admin permission required).");
        }
        return false;
    }

    // 2. Check WSL feature is active
    const statusCheck = shell.exec('wsl --status', { silent: true });
    if (statusCheck.code !== 0) {
        if (!silent) {
            log.warn("⚠️  WSL is installed but not fully configured (restart may be pending).");
            log.warn("   👉 Try restarting your PC, then run 'uso install' again.");
        }
        return false;
    }

    // 3. Check Ubuntu distro is ready
    const ubuntuCheck = shell.exec('wsl -d Ubuntu -e true', { silent: true });
    if (ubuntuCheck.code !== 0) {
        if (!silent) {
            log.warn("⚠️  WSL installed but Ubuntu distro is not yet set up.");
            log.warn("   👉 Run 'uso install' to finish the setup.");
        }
        return false;
    }

    if (!silent) log.success("✅ WSL installed and Ubuntu ready");
    return true;
};

const checkRust = (silent = false) => {
    const stealth = getStealthContext();
    const rustc = runVersionCheck('rustc', stealth);
    const installed = rustc.code === 0;
    if (!silent) {
        if (installed) {
            const scope = stealth.enabled ? ' via WSL' : '';
            log.success(`✅ Rust installed${scope} (${rustc.stdout.trim()})`);
        } else {
            const scope = stealth.enabled ? ' in WSL environment' : '';
            log.error(`❌ Rust not found${scope}`);
        }
    }
    return installed;
};

const checkSolana = (silent = false) => {
    const stealth = getStealthContext();

    if (stealth.enabled) {
        const solanaWsl = runVersionCheck('solana', stealth);
        const installed = solanaWsl.code === 0;
        if (!silent) {
            if (installed) log.success(`✅ Solana CLI installed via WSL (${solanaWsl.stdout.trim()})`);
            else log.error("❌ Solana CLI not found in WSL environment");
        }
        return installed;
    }

    // 1. Try PATH first
    let solana = shell.exec('solana --version', { silent: true });
    if (solana.code === 0) {
        if (!silent) log.success(`✅ Solana CLI installed (${solana.stdout.trim()})`);
        return true;
    }

    // 2. Try default Windows path if on Windows
    if (os.platform() === 'win32') {
        const home = os.homedir();
        // Modern path (Agave/Solana)
        const defaultPath = path.join(home, '.local', 'share', 'solana', 'install', 'active_release', 'bin', 'solana.exe');

        if (fs.existsSync(defaultPath)) {
            if (!silent) log.success(`✅ Solana CLI installed (Found at ${defaultPath})`);
            // Optionally we could try to get version from it, but existence is enough to skip install
            return true;
        }
    }

    if (!silent) log.error("❌ Solana CLI not found");
    return false;
};

const checkAnchor = (silent = false) => {
    const stealth = getStealthContext();
    const anchor = runVersionCheck('anchor', stealth);
    const installed = anchor.code === 0;
    if (!silent) {
        if (installed) {
            const scope = stealth.enabled ? ' via WSL' : '';
            log.success(`✅ Anchor installed${scope} (${anchor.stdout.trim()})`);
        } else {
            const scope = stealth.enabled ? ' in WSL environment' : '';
            log.error(`❌ Anchor not found${scope}`);
        }
    }
    return installed;
};

const checkCppTools = (silent = false) => {
    if (os.platform() !== 'win32') return true; // Not needed on others

    // 1. Check PATH
    const hasCl = !!shell.which('cl');
    if (hasCl) {
        if (!silent) log.success("✅ C++ Build Tools (cl.exe) found in PATH");
        return true;
    }

    // 2. Check via vswhere
    const programFiles = process.env['ProgramFiles(x86)'] || process.env['ProgramFiles'];
    const vswherePath = path.join(programFiles, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');

    if (fs.existsSync(vswherePath)) {
        // Use quotes around * to prevent shell globbing issues
        // We look for ANY product that installs VC tools. 
        // We relax the requirement to just 'installationPath' to confirm VS is present, 
        // as 'Desktop development with C++' is the standard workload.
        // But to be safe, we should check for the VC component if possible.
        // Tests showed that -products * returned the install path successfully.

        const cmd = `"${vswherePath}" -latest -products "*" -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`;
        const result = shell.exec(cmd, { silent: true });

        if (result.code === 0 && result.stdout.trim().length > 0) {
            if (!silent) log.success("✅ C++ Build Tools detected (via vswhere).");
            return true;
        }

        // Fallback: Check for just the workload, or even just the existence of VS Build Tools
        // usage: vswhere -latest -products * -requires Microsoft.VisualStudio.Workload.VCTools
        const cmd2 = `"${vswherePath}" -latest -products "*" -requires Microsoft.VisualStudio.Workload.VCTools -property installationPath`;
        const result2 = shell.exec(cmd2, { silent: true });

        if (result2.code === 0 && result2.stdout.trim().length > 0) {
            if (!silent) log.success("✅ C++ Build Tools detected (via vswhere workload).");
            return true;
        }
    }

    if (!silent) {
        log.warn("⚠️  C++ Build Tools (cl.exe) not found.");
        log.warn("   Rust requires 'Desktop development with C++' to compile.");
    }
    return false;
};

const doctor = async () => {
    const platform = os.platform();
    const stealth = getStealthContext();
    log.header(`🩺 Running Doctor for ${platform}...`);
    if (platform === 'win32' && stealth.enabled) {
        log.info(`🐧 Stealth Mode active (WSL distro: ${stealth.distro}). Checking toolchain inside WSL.`);
    }

    checkGit();
    if (platform === 'win32') checkWsl();
    checkRust();
    checkSolana();
    checkAnchor();
    checkCppTools();
};

module.exports = {
    doctor,
    checkGit,
    checkWsl,
    checkRust,
    checkSolana,
    checkAnchor,
    checkCppTools
};
