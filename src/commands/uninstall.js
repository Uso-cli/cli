const shell = require("shelljs");
const { log, spinner } = require("../utils/logger");
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { isStealthMode } = require("../utils/stealth");
const { runWsl } = require("../utils/wsl-bridge");

const askQuestion = (query) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
};

const getStealthContext = () => {
  if (os.platform() !== "win32") return { enabled: false, distro: "Ubuntu" };
  return isStealthMode();
};

const runInStealth = (command, stealth, silent = true) => {
  const envSetup =
    'source $HOME/.cargo/env 2>/dev/null; export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$PATH"';
  return runWsl(`${envSetup} && ${command}`, {
    distro: stealth.distro,
    execOpts: { silent },
  });
};

const commandExists = (command, stealth) => {
  if (stealth.enabled) {
    const result = runInStealth(`command -v ${command}`, stealth, true);
    return result.code === 0;
  }
  return !!shell.which(command);
};

const wslPathExists = (wslPath, stealth) => {
  const result = runInStealth(`[ -e "${wslPath}" ]`, stealth, true);
  return result.code === 0;
};

const getInstalledAvmVersions = (stealth) => {
  const listResult = stealth.enabled
    ? runInStealth("avm list", stealth, true)
    : shell.exec("avm list", { silent: true });

  if (listResult.code !== 0) return [];

  const versions = [];
  for (const rawLine of listResult.stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // avm list output can contain markers like "* 0.30.1" or "0.30.1 (current)"
    const match = line.match(/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/);
    if (match) versions.push(match[1]);
  }

  return [...new Set(versions)];
};

const isCargoPackageInstalled = (packageName, stealth) => {
  const checkCmd = `cargo install --list | grep -q '^${packageName} v'`;
  const result = stealth.enabled
    ? runInStealth(checkCmd, stealth, true)
    : shell.exec(checkCmd, { silent: true });
  return result.code === 0;
};

const uninstallAnchorComponents = (stealth) => {
  if (commandExists("avm", stealth)) {
    const versions = getInstalledAvmVersions(stealth);
    if (versions.length > 0) {
      for (const version of versions) {
        runOrElevate(`avm uninstall ${version}`, `Uninstall Anchor (AVM ${version})`, stealth);
      }
    } else {
      log.info("No AVM-managed Anchor versions found to remove.");
    }
  }

  if (isCargoPackageInstalled("anchor-cli", stealth)) {
    runOrElevate(
      "cargo uninstall anchor-cli",
      "Uninstall anchor-cli",
      stealth,
    );
  }

  if (isCargoPackageInstalled("avm", stealth)) {
    runOrElevate("cargo uninstall avm", "Uninstall avm", stealth);
  }

  log.success("Anchor removal steps completed.");
      } else {
        log.success("✅ Anchor is not installed.");
      }
      return;
    }

    if (component === "solana") {
      // Check PATH first
      let solanaInstalled = commandExists("solana", stealth);
      const localShareSolana = path.join(
        os.homedir(),
        ".local",
        "share",
        "solana",
      );
      const wslSolanaPath = "$HOME/.local/share/solana";

      // If not found in PATH, check default location
      if (!solanaInstalled) {
        if (stealth.enabled) {
          solanaInstalled = wslPathExists(wslSolanaPath, stealth);
        } else if (fs.existsSync(localShareSolana)) {
          solanaInstalled = true;
        }
      }

      if (solanaInstalled) {
        log.info("Removing Solana CLI...");

        if (stealth.enabled) {
          runOrElevate(
            `rm -rf "${wslSolanaPath}"`,
            `Remove folder ${wslSolanaPath}`,
            stealth,
          );
          log.success(`Removed ${wslSolanaPath}`);
        } else {
          if (fs.existsSync(localShareSolana)) {
            try {
              fs.rmSync(localShareSolana, { recursive: true, force: true });
              log.success(`Removed ${localShareSolana}`);
            } catch (err) {
              log.warn(
                `Failed to remove ${localShareSolana} directly: ${err.message}`,
              );
              log.info("Trying to remove via elevated command...");
              runOrElevate(
                `rmdir /s /q "${localShareSolana}"`,
                `Remove folder ${localShareSolana}`,
                stealth,
              );
            }
          } else {
            log.warn(
              `Could not find Solana folder at ${localShareSolana}. It might be removed already.`,
            );
          }
        }
      } else {
        log.success("✅ Solana CLI is not installed.");
      }
      return;
    }

    if (component === "rust") {
      const rustInstalled = commandExists("rustc", stealth);
      if (rustInstalled) {
        log.info("Running rustup self uninstall...");
        runOrElevate("rustup self uninstall -y", "Uninstall Rust", stealth);
      } else {
        log.success("✅ Rust is not installed.");
      }
      return;
    }

    log.error(
      `❌ Unknown component: ${component}. Available: rust, solana, anchor`,
    );
    return;
  }

  // --- FULL INTERACTIVE UNINSTALL ---

  log.warn("This process allows you to remove components installed by uso.");
  log.warn("Please be careful, especially with wallet removal!");

  const proceed = await askQuestion(
    "👉 Do you want to proceed with uninstallation? (y/N): ",
  );
  if (proceed.toLowerCase() !== "y") {
    log.info("Operation cancelled.");
    return;
  }

  // 1. Uninstall Anchor
  const anchorInstalled = commandExists("anchor", stealth);
  if (anchorInstalled) {
    const removeAnchor = await askQuestion(
      "\n⚓ Remove Anchor Framework? (y/N): ",
    );
    if (removeAnchor.toLowerCase() === "y") {
      log.info("Removing Anchor...");
      uninstallAnchorComponents(stealth);
    }
  }

  // 2. Uninstall Solana
  let solanaInstalled = commandExists("solana", stealth);
  const localShareSolana = path.join(os.homedir(), ".local", "share", "solana");
  const wslSolanaPath = "$HOME/.local/share/solana";

  // If not found in PATH, check default location (like doctor does)
  if (!solanaInstalled) {
    if (stealth.enabled) {
      solanaInstalled = wslPathExists(wslSolanaPath, stealth);
    } else if (fs.existsSync(localShareSolana)) {
      solanaInstalled = true;
    }
  }

  if (solanaInstalled) {
    const removeSolana = await askQuestion("\n☀️  Remove Solana CLI? (y/N): ");
    if (removeSolana.toLowerCase() === "y") {
      log.info("Removing Solana CLI...");

      // Default locations
      // const localShareSolana = path.join(os.homedir(), '.local', 'share', 'solana'); // Already defined

      if (stealth.enabled) {
        runOrElevate(
          `rm -rf "${wslSolanaPath}"`,
          `Remove folder ${wslSolanaPath}`,
          stealth,
        );
        log.success(`Removed ${wslSolanaPath}`);
      } else {
        if (fs.existsSync(localShareSolana)) {
          try {
            fs.rmSync(localShareSolana, { recursive: true, force: true });
            log.success(`Removed ${localShareSolana}`);
          } catch (err) {
            log.warn(
              `Failed to remove ${localShareSolana} directly: ${err.message}`,
            );
            log.info("Trying to remove via elevated command...");
            runOrElevate(
              `rmdir /s /q "${localShareSolana}"`,
              `Remove folder ${localShareSolana}`,
              stealth,
            );
          }
        } else {
          log.warn(
            `Could not find Solana at ${localShareSolana}. It might be already removed.`,
          );
        }
      }
    }
  }

  // 3. Uninstall Rust
  const rustInstalled = commandExists("rustc", stealth);
  if (rustInstalled) {
    const removeRust = await askQuestion("\n🦀 Remove Rust? (y/N): ");
    if (removeRust.toLowerCase() === "y") {
      log.info("Running rustup self uninstall...");
      runOrElevate("rustup self uninstall -y", "Uninstall Rust", stealth);
    }
  }

<<<<<<< HEAD
  // 3.5 Remove WSL Distro (if stealth mode is active)
  if (stealth.enabled && os.platform() === "win32") {
    const removeWslDistro = await askQuestion(
      "\n🐧 Remove WSL Ubuntu distro completely? (y/N): ",
    );
    if (removeWslDistro.toLowerCase() === "y") {
      log.warn(
        `⚠️  This will completely remove the ${stealth.distro} distro and all its data.`,
      );
      const confirmWslRemoval = await askQuestion(
        "💥 Type 'REMOVE WSL' to confirm distro removal: ",
      );
      if (confirmWslRemoval === "REMOVE WSL") {
        log.info(`Unregistering ${stealth.distro} distro...`);
        const unregisterCmd = `wsl --unregister ${stealth.distro}`;
        const result = runOrElevate(
          unregisterCmd,
          `Unregister WSL distro ${stealth.distro}`,
          { enabled: false, distro: stealth.distro },
        );
        if (result) {
          log.success(`✅ ${stealth.distro} distro removed.`);
        }
      } else {
        log.info("WSL distro removal cancelled.");
      }
    }
  }

=======
>>>>>>> d47ca156cb2a252419c54c520c7fcd0f0c18c525
  // 4. WALLET REMOVAL (DANGER)
  const walletPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const wslWalletPath = "$HOME/.config/solana/id.json";
  const hasNativeWallet = fs.existsSync(walletPath);
  const hasWslWallet = stealth.enabled
    ? wslPathExists(wslWalletPath, stealth)
    : false;

  if (hasNativeWallet || hasWslWallet) {
    log.error("\n⚠️  DANGER ZONE ⚠️");
    if (hasNativeWallet) log.warn(`Found a Solana wallet at: ${walletPath}`);
    if (hasWslWallet)
      log.warn(`Found a Solana wallet in WSL at: ${wslWalletPath}`);
    log.warn(
      "If you delete this without a backup, your funds will be LOST FOREVER.",
    );

    const removeWallet = await askQuestion(
      "💥 Do you REALLY want to delete this wallet? (type 'DELETE' to confirm): ",
    );
    if (removeWallet === "DELETE") {
      if (hasNativeWallet) {
        try {
          fs.unlinkSync(walletPath);
          log.success("Native wallet deleted.");

          // Clean up parent config dir if empty
          const configDir = path.dirname(walletPath);
          try {
            if (fs.readdirSync(configDir).length === 0) {
              fs.rmSync(configDir, { recursive: true, force: true });
            }
          } catch (e) {}
        } catch (err) {
          log.error(`Failed to delete native wallet: ${err.message}`);
        }
      }

      if (hasWslWallet) {
        const deleted = runOrElevate(
          `rm -f "${wslWalletPath}"`,
          "Delete WSL wallet",
          stealth,
        );
        if (deleted) {
          // Best effort cleanup of config dir if empty.
          runOrElevate(
            'rmdir "$HOME/.config/solana" 2>/dev/null || true',
            "Cleanup WSL wallet config directory",
            stealth,
          );
          log.success("WSL wallet deleted.");
        }
      }
    } else {
      log.info("Skipping wallet deletion.");
    }
  }

  if (stealth.enabled) {
    const configPath = path.join(os.homedir(), ".uso-config.json");
    if (fs.existsSync(configPath)) {
      const disableStealth = await askQuestion(
        "\n🐧 Disable Stealth WSL mode for USO? (y/N): ",
      );
      if (disableStealth.toLowerCase() === "y") {
        try {
          fs.rmSync(configPath, { force: true });
          log.success("Stealth mode config removed.");
        } catch (err) {
          log.warn(`Failed to remove stealth config: ${err.message}`);
        }
      }
    }
  }

  log.header("\n✅ Cleanup complete.");
  log.info("To remove the 'uso' tool itself, run:");
  log.info("   npm uninstall -g uso");
};

module.exports = { uninstall };
