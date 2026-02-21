const shell = require('shelljs');
const { log, spinner } = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const os = require('os');

const installWindows = async (shouldInstallRust, shouldInstallSolana) => {
    log.header("🪟 Windows detected.");
    log.warn("⚠️  IMPORTANT WINDOWS PREREQUISITES:");
    log.warn("1. If the installer is blocked, check 'Windows Security > Virus & threat protection > Protection history'.");
    log.warn("   You may need to manually 'Allow' the blocked app or disable 'Smart App Control' temporarily.");
    log.warn("2. Ensure 'Desktop development with C++' is installed via Visual Studio Build Tools.");
    log.warn("3. Run this command from the 'Developer Command Prompt for VS 2022' to avoid Rust errors.");

    // 1. Check for C++ Build Tools (Robust)
    // Rust needs C++, Anchor needs Rust. 
    // We check this if we are installing either, because even if Rust is present, 
    // Anchor build might fail if C++ tools are missing/broken.
    if (shouldInstallRust || shouldInstallSolana) {
        const hasCl = shell.which('cl');
        let hasCppTools = false;

        // Try vswhere if cl is missing
        if (!hasCl) {
            const programFilesx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
            const vswhere = path.join(programFilesx86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');

            if (fs.existsSync(vswhere)) {
                // Check specifically for VC++ tools
                const toolsCheck = shell.exec(`"${vswhere}" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`, { silent: true });
                if (toolsCheck.code === 0 && toolsCheck.stdout.trim().length > 0) {
                    hasCppTools = true;
                }
            }
        } else {
            hasCppTools = true;
        }

        if (!hasCppTools) {
            log.error("❌ Critical Dependency Missing: Visual Studio C++ Build Tools");
            log.error("   Rust and Anchor CANNOT run without these tools.");
            log.warn("👉 Install from: https://visualstudio.microsoft.com/visual-cpp-build-tools/");
            log.warn("   Workload required: 'Desktop development with C++'");
            log.warn("   Aborting installation to prevent broken setup.");
            return false; // STOP HERE
        }

        if (!hasCl && hasCppTools) {
            log.warn("⚠️  C++ Build Tools are installed but 'cl.exe' is not in PATH.");
            log.warn("   This WILL cause Rust installation to fail with error 0xc0e90002 or similar.");
            log.warn("👉 SOLUTION: Close this terminal and open 'Developer Command Prompt for VS 2022' (or similar).");
            log.warn("   Then run `uso init` inside that prompt.");
            // We give a chance to continue, but valid warning is given.
        }
    }

    // Use specific temp directory to bypass AppLocker on Desktop
    const tempDir = os.tmpdir();
    const rustInstallerPath = path.join(tempDir, 'rustup-init.exe');
    const solanaInstallerPath = path.join(tempDir, 'solana-install.exe');

    // 2. Install Rust
    if (shouldInstallRust) {
        log.info("🦀 Installing Rust (rustup-init.exe)...");
        log.info(`   Downloading to: ${rustInstallerPath}`);

        shell.exec(`powershell -Command "Invoke-WebRequest -Uri https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe -OutFile '${rustInstallerPath}'"`);

        // Unblock the file (Robust)
        log.info("ℹ️ Debug: Attempting to unblock rustup-init.exe...");
        const unblock = shell.exec(`powershell -Command "Unblock-File -Path '${rustInstallerPath}'"`);

        if (unblock.code !== 0) {
            log.warn("⚠️  Failed to unblock rustup-init.exe. Trying elevated...");
            shell.exec(`powershell -Command "Start-Process powershell -ArgumentList 'Unblock-File -Path \\"${rustInstallerPath}\\"' -Verb RunAs -Wait"`);
        } else {
            log.info("ℹ️ Debug: Successfully unblocked rustup-init.exe");
        }

        // Run from temp
        const rustInstall = shell.exec(`powershell -Command "& '${rustInstallerPath}' -y"`);

        if (rustInstall.code !== 0) {
            log.warn("⚠️  Rust installer finished with a non-zero code. It might have succeeded if you saw 'Rust is installed now'.");
        } else {
            log.success("✅ Rust installed.");
        }

        if (fs.existsSync(rustInstallerPath)) {
            try { fs.unlinkSync(rustInstallerPath); } catch (e) { }
        }
    } else {
        log.info("🦀 Rust is already installed. Skipping.");
    }

    // 3. Install Solana CLI (Agave)
    if (shouldInstallSolana) {
        log.info("☀️ Installing Solana CLI (Agave)...");
        log.info(`   Downloading to: ${solanaInstallerPath}`);

        const downloadCmd = `powershell -Command "Invoke-WebRequest -Uri https://release.anza.xyz/stable/solana-install-init-x86_64-pc-windows-msvc.exe -OutFile '${solanaInstallerPath}'"`;
        const dlResult = shell.exec(downloadCmd);

        // Unblock the file (Robust)
        log.info("ℹ️ Debug: Attempting to unblock solana-install.exe...");
        const unblockSolana = shell.exec(`powershell -Command "Unblock-File -Path '${solanaInstallerPath}'"`);

        if (unblockSolana.code !== 0) {
            log.warn("⚠️  Failed to unblock solana-install.exe via Unblock-File. Trying elevated...");
            shell.exec(`powershell -Command "Start-Process powershell -ArgumentList 'Unblock-File -Path \\"${solanaInstallerPath}\\"' -Verb RunAs -Wait"`);
        } else {
            log.info("ℹ️ Debug: Successfully unblocked solana-install.exe");
        }

        if (dlResult.code !== 0) {
            log.error("❌ Failed to download Solana installer.");
            return false;
        }

        // Try regular install first
        log.info("   Running Solana Installer...");
        const installResult = shell.exec(`"${solanaInstallerPath}" stable`, { silent: true });

        // Check for Symlink Error (1314) for potential auto-elevation
        if (installResult.code !== 0) {
            const output = installResult.stderr + installResult.stdout;

            if (output.includes("os error 1314") || output.includes("blocked by your organization") || output.includes("Device Guard") || output.includes("Application Control policy")) {
                log.info("ℹ️  Privilege escalation required (Symlinks or Device Guard).");
                log.info("🛡️  Triggering Run as Administrator (UAC)...");
                log.info("👉 Please click 'Yes' in the popup window to allow the installer.");

                // Use Start-Process with -Verb RunAs to trigger elevation
                // -Wait ensures we actually wait for it to finish
                const elevateCmd = `powershell -Command "Start-Process -FilePath '${solanaInstallerPath}' -ArgumentList 'stable' -Verb RunAs -Wait"`;

                const elevatedRun = shell.exec(elevateCmd);

                if (elevatedRun.code === 0) {
                    // We can't easily capture stdout from the spawned high-privilege window, 
                    // so we assume success if the process exited cleanly.
                    log.success("✅ Solana Installer finished (Elevated).");
                } else {
                    log.error("❌ Elevated installation failed or was cancelled.");
                    return false;
                }
            } else {
                // It failed for some other reason, so WE MUST show the output now
                console.error(output);
                log.error("❌ Solana CLI installation failed.");
                // Don't return false hard here as we might want to continue, but usually this is fatal
            }
        } else {
            // Success on first try
            console.log(installResult.stdout); // Show success output if any relevant
            log.success("✅ Solana CLI installed.");
        }

        if (fs.existsSync(solanaInstallerPath)) {
            try { fs.unlinkSync(solanaInstallerPath); } catch (e) { }
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
