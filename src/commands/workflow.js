const shell = require("shelljs");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { log, spinner } = require("../utils/logger");
const { isStealthMode } = require("../utils/stealth");
const { runWsl, toWslPath } = require("../utils/wsl-bridge");

const isUsoCoreBridgeEnabled = () =>
  process.env.USE_INTENT_SDK === "1" || process.env.USO_CORE_BRIDGE === "1";

const runViaUsoCoreBridge = async (command, args = [], binary = "anchor") => {
  try {
    const {
      runCliIntentAdapter,
    } = require("../../packages/uso-core/dist/cjs/adapters/cli.js");
    const stealth = isStealthMode();

    const result = await runCliIntentAdapter({
      command,
      args,
      binary,
      cwd: process.cwd(),
      preferWsl: !!stealth.enabled,
    });

    if (!result.handled) {
      return false;
    }

    if (result.ok) {
      return true;
    }

    log.warn(
      `⚠️  uso-core bridge returned status '${result.status || "failed"}'. Falling back to legacy workflow.`,
    );
    if (result.reason) {
      log.warn(`uso-core reason: ${result.reason}`);
    }
    return false;
  } catch (err) {
    log.warn(
      "⚠️  uso-core bridge unavailable. Falling back to legacy workflow.",
    );
    return false;
  }
};

const runProxyCommand = async (command, args = [], binary = "anchor") => {
  if (isUsoCoreBridgeEnabled()) {
    const bridged = await runViaUsoCoreBridge(command, args, binary);
    if (bridged) {
      return;
    }
  }

  const stealth = isStealthMode();

  // --- STEALTH WSL MODE ---
  // Smart routing: prefer native binary if available (e.g. native Anchor on Windows
  // connecting to WSL validator via localhost). Only WSL-route if native binary is missing.
  const nativeAvailable = shell.which(binary);
  if (stealth.enabled && !nativeAvailable) {
    const fullCommand = `${binary} ${command} ${args.join(" ")}`;

    // Source cargo/solana paths inside WSL before running
    const envSetup =
      'source $HOME/.cargo/env 2>/dev/null; export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"';
    const wslCwd = toWslPath(process.cwd());
    const execution = runWsl(`${envSetup} && ${fullCommand}`, {
      distro: stealth.distro,
      cwd: process.cwd(),
    });

    return;
  }

  // --- NATIVE MODE ---
  // Check if binary is available
  if (!shell.which(binary)) {
    log.error(`❌ ${binary} is not found in PATH.`);
    log.warn(
      "👉 Run 'uso init' (or 'uso install') to set up your environment.",
    );
    return;
  }

  const fullCommand = `${binary} ${command} ${args.join(" ")}`;

  const execution = shell.exec(fullCommand);

  if (execution.code === 0) {
    return;
  }

  const output = (execution.stderr || "") + (execution.stdout || "");

  // Detect Windows-specific errors that require elevation
  const isPrivilegeError =
    output.includes("os error 1314") ||
    output.includes("A required privilege is not held by the client");
  const isAppControlBlock =
    output.includes("os error 4551") ||
    output.includes("Application Control policy has blocked");

  if ((isPrivilegeError || isAppControlBlock) && os.platform() === "win32") {
    if (isAppControlBlock) {
      log.warn("⚠️  Windows Application Control is blocking build scripts.");
    } else {
      log.warn(
        "⚠️  Windows requires Administrator privileges for this operation.",
      );
    }

    // Clean stale blocked artifacts before elevated retry (only for cargo/anchor builds)
    if (isAppControlBlock && binary === "anchor") {
      const cleanSpin = spinner("Cleaning blocked build artifacts...").start();
      shell.exec("cargo clean", { silent: true, cwd: process.cwd() });
      cleanSpin.succeed("Build cache cleaned.");
    }

    await runElevatedWithProgress(command, args, binary);
  } else {
    // Command failed (non-elevated)
  }
};

/**
 * Runs the command in a **VISIBLE** elevated PowerShell window.
 * This is the robust fallback for Smart App Control / WDAC errors.
 * We rely on the user to see the output in the new window.
 */
const runElevatedWithProgress = (command, args = [], binary = "anchor") => {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd().replace(/\\/g, "\\\\");
    const cargoBin = path
      .join(os.homedir(), ".cargo", "bin")
      .replace(/\\/g, "\\\\");
    const progressFile = path.join(process.cwd(), "uso-elevation.log");
    const progressFileEscaped = progressFile.replace(/\\/g, "\\\\");

    // 1. Prepare progress file
    try {
      fs.writeFileSync(progressFile, "");
    } catch (e) {}

    // 2. Construct Elevated Command
    const innerCmd = `
            $ErrorActionPreference = "Stop";
            Start-Transcript -Path "${progressFileEscaped}" -Append -Force | Out-Null;
            
            $env:PATH = "${cargoBin};" + [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User");
            
            # Exclusions for Speed/Stability
            Add-MpPreference -ExclusionProcess "cargo.exe" -ErrorAction SilentlyContinue;
            Add-MpPreference -ExclusionProcess "rustc.exe" -ErrorAction SilentlyContinue;
            Add-MpPreference -ExclusionProcess "anchor.exe" -ErrorAction SilentlyContinue;
            Add-MpPreference -ExclusionProcess "solana.exe" -ErrorAction SilentlyContinue;
            Add-MpPreference -ExclusionProcess "node.exe" -ErrorAction SilentlyContinue;

            Set-Location "${cwd}";
            
            Write-Host "🔒 Running '${binary} ${command}' with Elevated Privileges..." -ForegroundColor Cyan;
            
            try {
                # Run command and let Transcript capture output
                & ${binary} ${command} ${args.join(" ")};
                
                if ($LASTEXITCODE -eq 0) {
                     Write-Host "✅ Success!" -ForegroundColor Green;
                     Write-Host "USO_AC_SUCCESS" -ForegroundColor Black; # Signal to Node
                } else {
                     Write-Host "❌ Failed via elevated process." -ForegroundColor Red;
                     Write-Host "USO_AC_FAILURE" -ForegroundColor Black; # Signal to Node
                }
            } catch {
                Write-Host "Error: $_" -ForegroundColor Red;
                Write-Host "USO_AC_FAILURE" -ForegroundColor Black;
            }
            
            Stop-Transcript | Out-Null;
            Write-Host "Press any key to close..." -ForegroundColor Gray;
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown");
        `
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // 3. Spawn Window (-NoExit to prevent immediate close on crash)
    const innerCmdBytes = Buffer.from(innerCmd, "utf16le");
    const innerCmdBase64 = innerCmdBytes.toString("base64");
    const psCmd = `powershell -Command "Start-Process powershell -ArgumentList '-NoExit', '-EncodedCommand', '${innerCmdBase64}' -Verb RunAs"`;
    shell.exec(psCmd);

    // 4. Stream Log to Main Console
    let lastSize = 0;
    const spin = spinner(
      "Waiting for output from elevated terminal...",
    ).start();

    const checkInterval = setInterval(() => {
      try {
        if (!fs.existsSync(progressFile)) return;

        const stats = fs.statSync(progressFile);
        if (stats.size > lastSize) {
          const fd = fs.openSync(progressFile, "r");
          const buffer = Buffer.alloc(stats.size - lastSize);
          fs.readSync(fd, buffer, 0, buffer.length, lastSize);
          fs.closeSync(fd);

          const rawText = buffer.toString("utf8");
          const displayText = rawText
            .replace(/USO_AC_SUCCESS/g, "")
            .replace(/USO_AC_FAILURE/g, "");

          // Stop spinner to print logs cleanly
          spin.stop();
          process.stdout.write(displayText);

          lastSize = stats.size;

          if (rawText.includes("USO_AC_SUCCESS")) {
            clearInterval(checkInterval);
            spin.succeed("Elevated process completed successfully.");
            resolve();
          } else if (rawText.includes("USO_AC_FAILURE")) {
            clearInterval(checkInterval);
            spin.fail("Elevated process reported failure.");
            resolve();
          } else {
            // Restart spinner with "Building..." status since we are receiving data
            spin.start("Building...");
          }
        }
      } catch (e) {
        // Ignore busy/lock errors during polling
      }
    }, 500);
  });
};

const build = () => runProxyCommand("build", [], "anchor");
const deploy = () => runProxyCommand("deploy", [], "anchor");
const clean = () => runProxyCommand("clean", [], "anchor");

const test = async (args = []) => {
  const userArgs = Array.isArray(args) ? args : [];

  // On Windows, auto-detect validator to prevent anchor test from hanging
  if (
    os.platform() === "win32" &&
    !userArgs.includes("--skip-local-validator")
  ) {
    const isValidatorUp = () => {
      const res = shell.exec("netstat -an | findstr 8899", { silent: true });
      return res.code === 0 && res.stdout.length > 0;
    };

    if (isValidatorUp()) {
      log.info("✅ Validator detected on port 8899. Running tests against it.");
      userArgs.push("--skip-local-validator");
    } else {
      log.warn("⚠️  No validator detected. Starting one first...");
      log.info(
        "👉 Run 'uso val' in a separate terminal, then re-run 'uso test'.",
      );
      log.info("   Or use 'uso dev' to do both automatically.");
      return;
    }
  }

  return runProxyCommand("test", userArgs, "anchor");
};
const address = () => runProxyCommand("address", [], "solana");
const balance = (addrArg) => {
  const args = addrArg ? [addrArg] : [];
  return runProxyCommand("balance", args, "solana");
};
const airdrop = (amount, recipient) => {
  const args = [amount];
  if (recipient) args.push(recipient);
  return runProxyCommand("airdrop", args, "solana");
};

const validator = async (args = []) => {
  const stealth = isStealthMode();

  // --- STEALTH WSL MODE ---
  if (stealth.enabled) {
    const flags = Array.isArray(args) ? args : [];

    // Unix sockets (admin.rpc) don't work on NTFS-mounted paths (/mnt/c/).
    // Force ledger onto native Linux filesystem.
    if (!flags.some((f) => f.startsWith("--ledger"))) {
      flags.push("--ledger", "/tmp/test-ledger");
    }

    const cmdArgs = flags.join(" ");
    const fullCmd = `solana-test-validator ${cmdArgs}`;

    log.info("👉 Press Ctrl+C to stop it.");

    const envSetup =
      'source $HOME/.cargo/env 2>/dev/null; export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"';
    runWsl(`${envSetup} && ${fullCmd}`, {
      distro: stealth.distro,
      execOpts: { async: false },
    });
    return;
  }

  // --- NATIVE MODE ---
  if (!shell.which("solana-test-validator")) {
    log.error("❌ 'solana-test-validator' is not found in PATH.");
    log.warn("👉 Run 'uso init' to install it.");
    return;
  }

  // Check if args is the commander object (happens if no args defined in command)
  // or if it's an array of strings (if [args...] is defined)
  // Commander passes (args, options, command) if using [args...]
  // If we change bin/index.js to .command('validator [args...]'), args will be array.

  const flags = Array.isArray(args) ? args : [];

  // Robust Manual Cleanup for --reset on Windows
  // solana-test-validator --reset often fails with "Access Denied" on Windows due to file locks
  if (flags.includes("--reset") || flags.includes("-r")) {
    const ledgerPath = path.join(process.cwd(), "test-ledger");
    if (fs.existsSync(ledgerPath)) {
      const spin = spinner("🧹 Manually cleaning test-ledger...").start();
      try {
        // Retry loop for Windows file locking
        let retries = 5;
        while (retries > 0) {
          try {
            fs.rmSync(ledgerPath, { recursive: true, force: true });
            if (!fs.existsSync(ledgerPath)) break;
          } catch (e) {
            // wait 500ms
            shell.exec('powershell -Command "Start-Sleep -Milliseconds 500"');
          }
          retries--;
        }

        if (fs.existsSync(ledgerPath)) {
          // Last resort: ShellJS
          shell.rm("-rf", ledgerPath);
        }

        if (fs.existsSync(ledgerPath)) {
          spin.warn(
            "⚠️  Could not fully remove test-ledger. Validator might complain.",
          );
        } else {
          spin.succeed("Ledger reset successfully.");
        }
      } catch (e) {
        spin.warn(`⚠️  Manual cleanup failed: ${e.message}`);
      }
    }
  }

  const cmdArgs = flags.join(" ");
  const fullCmd = cmdArgs
    ? `solana-test-validator ${cmdArgs}`
    : "solana-test-validator";

  log.info("👉 Press Ctrl+C to stop it.");

  // Run and capture exit code
  // We use shell.exec, which blocks. If it runs successfully, it blocks until user Ctrl+C.
  // If it fails immediately (like Access Denied), it returns execution object.
  const execution = shell.exec(fullCmd);

  if (execution.code !== 0) {
    const output = (execution.stderr || "") + (execution.stdout || "");
    // On Windows, exit code 1 with "Access is denied" is common.
    // Also check for "os error 5" or "os error 1314"
    if (
      output.includes("Access is denied") ||
      output.includes("os error 5") ||
      execution.code === 1
    ) {
      log.warn(
        "⚠️  Validator failed/crashed. Retrying in specialized Administrator terminal...",
      );

      // Use Fire-and-Forget for validator (interactive/long-running)
      // We don't want to capture logs, we want the user to see the new window.
      const flagStr = flags.join(" ");
      const targetCmd = `solana-test-validator ${flagStr}`;

      log.warn(
        "👉 A new window will appear. Keep it open to run the validator!",
      );

      // Robust Launch using EncodedCommand to avoid quoting hell and set CWD correctly
      // 1. Set CWD (Critical: RunAs defaults to System32)
      // 2. Add Exclusions (Critical: Fixes Access Denied on ledger files)
      // 3. Run Validator
      // 4. Pause on Error

      const cwd = process.cwd();
      const psScript = `
                $ErrorActionPreference = 'Stop';
                try { Set-Location -Path '${cwd}'; } catch { Write-Host "⚠️  Could not set CWD. Keeping default." -ForegroundColor Yellow; }
                
                Write-Host "📂 Working Directory: $(Get-Location)" -ForegroundColor Gray;
                
                Write-Host "🛡️  Attempting to whitelist folder in Windows Defender..." -ForegroundColor Cyan;
                try {
                    Add-MpPreference -ExclusionPath '${cwd}' -ErrorAction SilentlyContinue;
                    Add-MpPreference -ExclusionProcess "solana-test-validator" -ErrorAction SilentlyContinue;
                    Write-Host "✅ Secured." -ForegroundColor Green;
                } catch {
                    Write-Host "⚠️  Could not set exclusions (User might not be Admin?)" -ForegroundColor Yellow;
                }

                Write-Host "🔓 Enabling Developer Mode for Symlinks..." -ForegroundColor Cyan;
                $regPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock";
                try {
                    New-Item -Path $regPath -Force -ErrorAction SilentlyContinue | Out-Null;
                    Set-ItemProperty -Path $regPath -Name "AllowDevelopmentWithoutDevLicense" -Value 1 -Type DWord -ErrorAction SilentlyContinue;
                    Write-Host "✅ Developer Mode Enabled." -ForegroundColor Green;
                } catch {
                    Write-Host "⚠️  Could not enable Developer Mode (Registry Write Failed)." -ForegroundColor Yellow;
                }

                Write-Host "🚀 Starting Validator: ${targetCmd}" -ForegroundColor Green;
                
                try {
                    & ${targetCmd};
                } catch {
                    Write-Host "❌ Validator Execution Failed: $_" -ForegroundColor Red;
                }
                
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "❌ Validator Crashed (Exit Code: $LASTEXITCODE). Press Enter to exit..." -ForegroundColor Red;
                    Read-Host;
                }
            `
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const encoded = Buffer.from(psScript, "utf16le").toString("base64");
      const psCmd = `powershell -Command "Start-Process powershell -ArgumentList '-NoExit', '-EncodedCommand', '${encoded}' -Verb RunAs"`;

      shell.exec(psCmd);

      log.success("✅ Validator launch sequence initiated.");
    }
  }
};

const unblock = () => {
  const cwd = process.cwd();

  if (os.platform() !== "win32") {
    log.success("✅ Not on Windows, nothing to unblock.");
    return;
  }

  const spin = spinner("Removing Mark-of-the-Web...").start();
  const cargoBin = path.join(os.homedir(), ".cargo", "bin").replace(/'/g, "''");
  const targetCwd = cwd.replace(/'/g, "''");

  // Use resolved paths to avoid $env variable expansion issues in single quotes
  // And use Where-Object for older PowerShell compatibility
  const cmd = `powershell -Command "Get-ChildItem -Path '${targetCwd}' -Recurse | Where-Object { !$\_.PSIsContainer } | Unblock-File; Get-ChildItem -Path '${cargoBin}' -Recurse | Where-Object { !$\_.PSIsContainer } | Unblock-File"`;

  const result = shell.exec(cmd, { silent: true });

  if (result.code === 0) {
    spin.succeed("Files unblocked successfully.");
    log.info("👉 Try running 'uso test' now.");
  } else {
    spin.fail("Failed to unblock files.");
    log.error(result.stderr);
    log.warn("👉 Try running this command as Administrator.");
  }
};

module.exports = {
  build,
  test,
  deploy,
  clean,
  unblock,
  airdrop,
  validator,
};

const dev = async () => {
  const stealth = isStealthMode();

  // 1. Check if validator is running
  const isValidatorRunning = () => {
    if (stealth.enabled) {
      // Check from Windows side — validator in WSL still binds to host port
      const res = shell.exec("netstat -an | findstr 8899", { silent: true });
      return res.code === 0 && res.stdout.length > 0;
    }
    const res = shell.exec("netstat -an | findstr 8899", { silent: true });
    return res.code === 0 && res.stdout.length > 0;
  };

  if (isValidatorRunning()) {
    log.success("✅ Validator is already running.");
  } else {
    // Spawn validator (this will open the Admin window)
    // We use [] args to start cleanly but persistently.
    // If it fails, the user will see it in the new window.
    await validator([]);

    // Wait for validator to be ready
    const spin = spinner("Waiting for Validator to respond...").start();
    let retries = 60; // 60 seconds (Increased for Windows genesis unpacking)
    while (retries > 0) {
      if (isValidatorRunning()) {
        spin.succeed("✅ Validator is online.");
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
      retries--;
    }

    if (retries === 0) {
      spin.warn(
        "⚠️  Validator might be taking a while to start. Check the blue window.",
      );
    }
  }

  // Fix: Pass --skip-local-validator directly (without --) so Anchor consumes it
  test(["--skip-local-validator"]);

  log.header("👀 Watching for changes...");
  log.info("👉 Change any .rs or .ts file to re-run tests.");
  log.info("👉 Press Ctrl+C to exit.");

  let debounce = false;
  const runTests = () => {
    if (debounce) return;
    debounce = true;
    setTimeout(() => (debounce = false), 2000); // 2s debounce

    console.clear();
    log.header("🔄 Detected change. Re-running tests...");
    test(["--skip-local-validator"]);
    log.header("👀 Watching for changes...");
  };

  // Simple Watcher using fs.watch
  const watchDirs = ["programs", "tests"];
  watchDirs.forEach((dir) => {
    const p = path.join(process.cwd(), dir);
    if (fs.existsSync(p)) {
      fs.watch(p, { recursive: true }, (eventType, filename) => {
        if (
          filename &&
          (filename.endsWith(".rs") || filename.endsWith(".ts"))
        ) {
          runTests();
        }
      });
    }
  });

  // Keep process alive
  setInterval(() => {}, 1000);
};

module.exports = {
  build,
  test,
  deploy,
  clean,
  unblock,
  airdrop,
  address,
  balance,
  validator,
  dev,
};
