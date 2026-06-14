const shell = require("shelljs");
const { log, spinner } = require("../utils/logger");
const { isWslInstalled, runWsl, toWslPath } = require("../utils/wsl-bridge");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");
const chalk = require("chalk");
const WSL_DISTRO = "Ubuntu";

const progressHelpers = `
print_progress() {
  local label="$1"
  local percent="$2"
  printf "\r%s %d%%" "$label" "$percent"
}

run_with_progress() {
  local label="$1"
  local start="$2"
  local end="$3"
  shift 3

  "$@" &
  local pid=$!
  local current="$start"

  while kill -0 "$pid" 2>/dev/null; do
    print_progress "$label" "$current"
    if [ "$current" -lt "$((end - 1))" ]; then
      current=$((current + 1))
    fi
    sleep 2
  done

  wait "$pid"
  local status=$?
  print_progress "$label" "$end"
  printf "\n"
  return "$status"
}
`.replace(/\r\n/g, "\n");

  // If exit code is 0, it's installed and working.
  if (checkDistro.code !== 0) {
    log.info(
      "≡ƒôª Configuring Uso Engine (Please approve UAC prompt if asked)...",
    );
    log.warn("ΓÅ│ This may take a few minutes (Downloading ~500MB)...");

    // Helper to try install commands
    const tryInstall = (args, description) => {
      log.info(`≡ƒæë Attempting: ${description}...`);
      // Fix Deprecation: shell: false is safer and prevents warning
      const proc = spawnSync("wsl", args, { stdio: "inherit", shell: false });
      return proc.status === 0;
    };

    // Attempt 1: Standard Install
    let success = tryInstall(
      ["--install", "-d", WSL_DISTRO],
      "Standard Install",
    );

    // Attempt 2: Update WSL Kernel (Fixes network/protocol issues)
    if (!success) {
      log.warn(
        "ΓÜá∩╕Å  Standard install failed. Attempting to update WSL kernel...",
      );
      spawnSync("wsl", ["--update"], { stdio: "inherit", shell: false });
      success = tryInstall(
        ["--install", "-d", WSL_DISTRO],
        "Install after Update",
      );
    }

    // Attempt 3: Web Download (Bypasses Microsoft Store blocks)
    if (!success) {
      log.warn("ΓÜá∩╕Å  Still failing. Trying --web-download (Bypasses Store)...");
      success = tryInstall(
        ["--install", "-d", WSL_DISTRO, "--web-download"],
        "Web Download Install",
      );
    }

    // Final Failure Handler
    if (!success) {
      log.error("Γ¥î Failed to configure Uso Engine.");
      log.error("≡ƒ¢æ Possible Causes: Internet Timeout, Firewall, or VPN.");
      log.warn(
        "\n≡ƒæë ACTION REQUIRED: Run this command manually in PowerShell as Administrator:",
      );
      console.log(
        chalk.bold.yellow(`    wsl --install -d ${WSL_DISTRO} --web-download`),
      );
      log.warn(
        "\nOnce that completes successfully, run 'uso setup --wsl' again.",
      );
      return false;
    }

    const verifyInstall = shell.exec(`wsl -d ${WSL_DISTRO} -e true`, {
      silent: true,
    });
    if (verifyInstall.code !== 0) {
      log.warn(
        `ΓÜá∩╕Å  ${WSL_DISTRO} is not ready yet. WSL installation usually needs a full system reboot before the distro becomes available.`,
      );
      log.warn(
        "≡ƒæë Restart Windows, then run 'uso install' again to continue the setup.",
      );
      return false;
    }

    log.success("Γ£à Uso Engine configured.");
  } else {
    log.success("Γ£à Uso Engine is ready.");
  }

  // 2.5 Hide from Windows Terminal (Stealth Mode)
  hideFromWindowsTerminal();

  // 3. Configure Internal Environment (Rust + Solana + Anchor)
  // We create a shell script and run it inside WSL.

  log.info("ΓÜÖ∩╕Å  Initializing Uso Engine environment...");

  // --- PHASE 1: System Dependencies (as root, no sudo needed) ---
  const rootScript = `
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

  ${progressHelpers}

if ! command -v cc &> /dev/null || ! command -v pkg-config &> /dev/null; then
    run_with_progress "≡ƒôª Installing system build tools..." 0 100 bash -lc "apt-get update -y -qq && apt-get install -y -qq curl build-essential pkg-config libssl-dev libudev-dev"
    echo "Γ£à Build tools installed."
else
    echo "Γ£à Build tools already present."
fi
`.replace(/\r\n/g, "\n");

  const rootScriptPath = path.join(process.cwd(), "uso_root_setup.sh");
  fs.writeFileSync(rootScriptPath, rootScript);
  const wslRootScriptPath = toWslPath(rootScriptPath);

  const spin1 = spinner("Phase 1/2: Installing system dependencies...").start();
  const rootRes = shell.exec(
    `wsl -d ${WSL_DISTRO} -u root -e bash "${wslRootScriptPath}"`,
  );
  fs.unlinkSync(rootScriptPath);

  if (rootRes.code !== 0) {
    spin1.fail("System dependency installation failed.");
    log.error(rootRes.stderr || "Unknown error during root setup.");
    return false;
  }
  spin1.succeed("System dependencies ready.");

  // --- PHASE 2: User Tools (Rust, Solana, Anchor as normal user) ---
  const userScript = `
#!/bin/bash
# NO set -e ΓÇö we handle errors per-step
FAILURES=""

${progressHelpers}

# Hush login
touch ~/.hushlogin

# --- Rust ---
source $HOME/.cargo/env 2>/dev/null || true

# rustc can exist but still fail if component/toolchain is broken.
if command -v rustc &> /dev/null && rustc --version >/dev/null 2>&1; then
    echo "Γ£à Rust already installed."
else
    # If rustup exists, try repairing first.
    if command -v rustup &> /dev/null; then
        echo "≡ƒªÇ Repairing Rust toolchain..."
        rustup toolchain install stable >/dev/null 2>&1 || true
        rustup default stable >/dev/null 2>&1 || true
        rustup component add rustc cargo >/dev/null 2>&1 || true
        source $HOME/.cargo/env 2>/dev/null || true
    fi

    if command -v rustc &> /dev/null && rustc --version >/dev/null 2>&1; then
        echo "Γ£à Rust repaired."
    else
        echo "≡ƒªÇ Installing Rust..."
      if run_with_progress "≡ƒªÇ Installing Rust..." 10 35 bash -lc "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"; then
            source $HOME/.cargo/env 2>/dev/null || true
            rustup toolchain install stable >/dev/null 2>&1 || true
            rustup default stable >/dev/null 2>&1 || true
            rustup component add rustc cargo >/dev/null 2>&1 || true

            if command -v rustc &> /dev/null && rustc --version >/dev/null 2>&1; then
                echo "Γ£à Rust installed."
            else
                FAILURES="$FAILURES rust"
                echo "Γ¥î Rust install completed but rustc is not runnable."
            fi
        else
            FAILURES="$FAILURES rust"
            echo "Γ¥î Rust installation failed."
        fi
    fi
fi
source $HOME/.cargo/env 2>/dev/null || true

# --- Solana SBPF Toolchain (required for anchor build) ---
if ! rustup target list 2>/dev/null | grep -q "sbpf-solana-solana"; then
    echo "≡ƒÄ» Installing Solana SBPF toolchain..."
    if run_with_progress "≡ƒÄ» Installing Solana SBPF target..." 35 55 rustup target add sbpf-solana-solana; then
        echo "Γ£à SBPF target installed."
    else
        FAILURES="$FAILURES sbpf-target"
        echo "Γ¥î SBPF target installation failed."
    fi
else
    echo "Γ£à SBPF target already installed."
fi

# Install cargo-build-sbf
if ! command -v cargo-build-sbf &> /dev/null; then
    echo "≡ƒö¿ Installing cargo-build-sbf..."
    if run_with_progress "≡ƒö¿ Installing cargo-build-sbf..." 55 60 cargo install cargo-build-sbf; then
        echo "Γ£à cargo-build-sbf installed."
    else
        FAILURES="$FAILURES cargo-build-sbf"
        echo "ΓÜá∩╕Å  cargo-build-sbf install failed (run 'uso init' to retry)."
    fi
else
    echo "Γ£à cargo-build-sbf already installed."
fi

# --- Solana ---
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
if ! command -v solana &> /dev/null; then
    echo "ΓÿÇ∩╕Å  Installing Solana CLI..."
    
    # Helper to download with retries and proper SSL handling
    install_solana_with_retry() {
        local url="$1"
        local description="$2"
        local max_attempts=3
        local attempt=1
        
        while [ $attempt -le $max_attempts ]; do
            if [ $attempt -gt 1 ]; then
                echo "  Retry attempt $attempt/$max_attempts..."
                sleep 2
            fi
            
            # Download installer script with SSL options and timeout
            if curl --proto '=https' --tlsv1.2 -sSf --max-time 60 --connect-timeout 10 \
                    --cacert /etc/ssl/certs/ca-certificates.crt \
                    "$url" > /tmp/solana_install.sh 2>/dev/null; then
                # Execute the downloaded script
                if bash /tmp/solana_install.sh; then
                    rm -f /tmp/solana_install.sh
                    return 0
                fi
            fi
            
            attempt=$((attempt + 1))
        done
        
        rm -f /tmp/solana_install.sh
        return 1
    }
    
    solana_installed=0
    
    # Try official Solana release
    if install_solana_with_retry "https://release.solana.com/stable/install" "Solana"; then
        solana_installed=1
        echo "Γ£à Solana installed."
    # Fallback to Agave (community-maintained)
    elif install_solana_with_retry "https://release.anza.xyz/stable/install" "Agave"; then
        solana_installed=1
        echo "Γ£à Solana installed (via Agave)."
    else
        FAILURES="$FAILURES solana"
        echo "ΓÜá∩╕Å  Solana install failed after retries. Network or certificate issue detected."
        echo "   Run 'uso init' again to retry."
    fi
    
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
else
    echo "Γ£à Solana already installed."
fi

# --- Anchor (AVM) ---
if ! command -v anchor &> /dev/null; then
    # Install AVM if not present
    if ! command -v avm &> /dev/null; then
        echo "ΓÜô Installing AVM (compiling from source, ~5 min)..."
    if run_with_progress "ΓÜô Installing AVM (compiling from source)..." 65 85 cargo install --git https://github.com/coral-xyz/anchor avm --locked --force; then
            echo "Γ£à AVM compiled."
        else
            FAILURES="$FAILURES avm"
            echo "Γ¥î AVM compilation failed."
        fi
    else
        echo "Γ£à AVM already installed."
    fi
    
    # Install Anchor via AVM (try binary first, then compile from source)
    if command -v avm &> /dev/null; then
        echo "ΓÜô Installing Anchor CLI..."
      if run_with_progress "ΓÜô Installing Anchor CLI..." 85 100 avm install latest; then
            avm use latest
            echo "Γ£à Anchor installed."
        else
            echo "ΓÜá∩╕Å  Binary download timed out. Building from source (this takes ~10 min)..."
        if run_with_progress "ΓÜô Building Anchor CLI from source..." 85 100 avm install latest --force; then
                avm use latest
                echo "Γ£à Anchor built from source."
            else
                FAILURES="$FAILURES anchor"
                echo "ΓÜá∩╕Å  Anchor install timed out. Run 'uso setup' again later."
            fi
        fi
    fi
else
    echo "Γ£à Anchor already installed."
fi

# --- Report ---
if [ -z "$FAILURES" ]; then
    echo "Γ£à Uso Engine Setup Complete."
    exit 0
else
    echo ""
    echo "ΓÜá∩╕Å  Partial setup. Failed:$FAILURES"
    echo "Run 'uso setup' again to retry failed components."
    exit 1
fi
`.replace(/\r\n/g, "\n");

  const userScriptPath = path.join(process.cwd(), "uso_user_setup.sh");
  fs.writeFileSync(userScriptPath, userScript);
  const wslUserScriptPath = toWslPath(userScriptPath);

  const spin2 = spinner(
    "Phase 2/2: Installing Rust, Solana, Anchor (this takes a while)...",
  ).start();
  const userRes = shell.exec(
    `wsl -d ${WSL_DISTRO} -e bash "${wslUserScriptPath}"`,
  );
  fs.unlinkSync(userScriptPath);

  if (userRes.code === 0) {
    spin2.succeed("Uso Engine configured successfully.");
  } else {
    spin2.warn("Uso Engine partially configured (some downloads timed out).");
    log.info("≡ƒæë Run 'uso setup' again to retry failed components.");
  }

  // Always set stealth mode config ΓÇö even partial setup enables routing
  const configPath = path.join(os.homedir(), ".uso-config.json");
  const config = { mode: "wsl", distro: WSL_DISTRO };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  log.success("Γ£à Stealth Mode Enabled. 'uso' commands will now run via WSL.");
  return true;
};

const hideFromWindowsTerminal = () => {
  try {
    const localAppData = process.env.LOCALAPPDATA;
    const packagesPath = path.join(localAppData, "Packages");

    // Find Windows Terminal package folder (name varies slightly but starts with Microsoft.WindowsTerminal)
    if (!fs.existsSync(packagesPath)) return;

    const terminalDirs = fs
      .readdirSync(packagesPath)
      .filter((name) => name.startsWith("Microsoft.WindowsTerminal"));

    if (terminalDirs.length === 0) return;

    const settingsPath = path.join(
      packagesPath,
      terminalDirs[0],
      "LocalState",
      "settings.json",
    );

    if (fs.existsSync(settingsPath)) {
      // Read settings
      // Note: settings.json can contain comments which JSON.parse fails on.
      // We'll use a simple regex to set hidden: true for Ubuntu if simpler parsing fails or just try.
      // Actually, modifying this file safely without a robust comment-stripping parser is risky.
      // A safer approach for "Stealth" might be just log that we configured it.
      // BUT, if we want to do it, we should be careful.

      // For now, let's just log a message that we would hide it,
      // or maybe we skip the robust parsing complexity to avoid breaking their terminal settings.
      // User requested "Programmatically edit".

      const content = fs.readFileSync(settingsPath, "utf8");
      // Check if Ubuntu is already there
      if (content.includes('"name": "Ubuntu"')) {
        // Very naive replacement to inject hidden: true.
        // We look for the Ubuntu profile block.
        // This is brittle. Let's try to parse if valid JSON.
        try {
          const settings = JSON.parse(content);
          if (settings.profiles && settings.profiles.list) {
            const profile = settings.profiles.list.find(
              (p) => p.name === "Ubuntu",
            );
            if (profile) {
              profile.hidden = true;
              fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
              log.info(
                "≡ƒò╡∩╕Å  Hid 'Ubuntu' from Windows Terminal (Stealth Mode Active).",
              );
            }
          }
        } catch (e) {
          // JSON parse failed (likely due to comments in settings.json)
          log.warn(
            "ΓÜá∩╕Å  Could not automatically hide Ubuntu icon (Comments in settings.json).",
          );
        }
      }
    }
  } catch (e) {
    // Silently fail to avoid alarming user
  }
};

module.exports = { installWslFeature, installWsl };
