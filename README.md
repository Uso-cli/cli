# Universal Solana Orchestrator (USO)

> **The fastest way to build on Solana — on any OS.**

USO is a zero-friction CLI toolchain that installs, manages, and runs your entire Solana development environment with a single command. Native or Stealth WSL. Your choice.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Stealth WSL Mode (Windows)](#stealth-wsl-mode-windows)
- [Full Environment Setup](#full-environment-setup)
- [Granular Installation](#granular-installation)
- [Project Scaffolding](#project-scaffolding)
- [Workflow Commands](#workflow-commands)
- [Wallet & SOL Commands](#wallet--sol-commands)
- [Developer Tools](#developer-tools)
- [Diagnostics & Verification](#diagnostics--verification)
- [Windows Security & Unblocking](#windows-security--unblocking)
- [Uninstallation](#uninstallation)
- [Command Reference](#command-reference)
- [Troubleshooting](#troubleshooting)

---

## Installation

Install USO globally via npm. Node.js (LTS recommended) must be installed first.

```bash
npm install -g @xaidenlabs/uso
```

**Prerequisites:**
| Requirement | Details |
|---|---|
| Node.js | v18+ LTS recommended |
| npm | Comes with Node.js |
| Administrator (Windows) | Some steps require elevated privileges — USO handles this automatically |
| C++ Build Tools (Windows) | Required by Rust. Install via Visual Studio Build Tools → "Desktop development with C++" |
| WSL2 (Stealth Mode) | Windows Subsystem for Linux 2, enabled in Windows Settings |

---

## Quick Start

```bash
# 1. Diagnose your environment first
uso doctor

# 2. Install the full stack (Rust + Solana + Anchor)
uso init

# 3. Verify everything is working
uso verify

# 4. Create your first project
uso create my-project
cd my-project && npm install

# 5. Start coding
uso dev
```

---

## Stealth WSL Mode (Windows Only)

**The recommended mode for Windows developers.** Stealth Mode deploys a hidden WSL2 Linux environment (the "Uso Engine") that runs all your tooling inside Linux while you stay in PowerShell.

```bash
uso init --wsl
```

**What this does:**
1. Installs a minimal Ubuntu WSL2 distro hidden from Windows Terminal
2. Installs Rust, Solana CLI, and Anchor inside the distro
3. Stores your configuration in `~/.uso-config.json`
4. All future `uso` commands auto-route through the WSL engine — transparently

**Why use it?**
- Eliminates `os error 1314` (symlink privilege errors)
- Bypasses Windows Smart App Control (`os error 4551`)
- Eliminates "Access Denied" on build artifacts
- The validator binds to `127.0.0.1` — tests connect seamlessly from Windows

**Check your current mode:**
```bash
cat ~/.uso-config.json
# { "mode": "wsl", "distro": "Ubuntu" }
```

**Switch back to native mode:**
```bash
# Delete the config to use native toolchain
del %USERPROFILE%\.uso-config.json
```

> **Note:** Even in Stealth Mode, USO prefers native binaries if they're available in PATH. The WSL engine is only used when a native binary is missing.

---

## Full Environment Setup

Install the complete Solana development stack in one command:

```bash
uso init
```

USO will:
1. Detect your operating system (Windows / macOS / Linux)
2. Check for C++ Build Tools (Windows only)
3. Install the Rust toolchain via `rustup`
4. Install the Solana CLI (Agave release)
5. Install the Anchor Version Manager (AVM) and Anchor Framework
6. Generate a new Solana wallet `~/.config/solana/id.json` if none exists
7. Update your system PATH

> **Windows Users:** You may see a UAC prompt. Click **Yes** to allow the installer. USO auto-retries any step that fails with a privilege error.

---

## Granular Installation

Already have some tools installed? Install only what you need:

```bash
# Install Rust only
uso install rust

# Install Solana CLI only
uso install solana

# Install Anchor Framework only
uso install anchor
```

These also work with `uso init <component>`:
```bash
uso init rust
uso init solana
uso init anchor
```

---

## Project Scaffolding

Create a new, production-ready Anchor project with all boilerplate pre-configured:

```bash
uso create <project-name>
```

**Example:**
```bash
uso create my-nft-program
cd my-nft-program
npm install
```

**What you get:**
```
my-nft-program/
├── Anchor.toml          # Pre-configured for localnet
├── programs/
│   └── my-nft-program/
│       └── src/
│           └── lib.rs   # Your Rust smart contract
├── tests/
│   └── my-nft-program.ts  # TypeScript test suite
├── package.json
└── tsconfig.json
```

Run your first test:
```bash
uso test
```

---

## Workflow Commands

All commands work in both Native and Stealth WSL mode. USO routes them correctly automatically.

### Build

Compile your Anchor program (wraps `anchor build`):

```bash
uso build
```

On Windows with Smart App Control, USO automatically:
- Cleans stale blocked build artifacts
- Retries in an elevated Administrator terminal
- Mirrors output back to your current window

### Test

Run your Anchor test suite (wraps `anchor test`):

```bash
uso test

# Pass flags directly to anchor test
uso test -- --skip-deploy
```

> **Windows Smart Behavior:** Before running tests, USO checks if a local validator is running on port `8899`. If one is detected, it adds `--skip-local-validator` automatically to prevent Anchor from hanging.

### Deploy

Deploy your compiled program to the configured cluster:

```bash
uso deploy
```

### Clean

Remove all build artifacts (wraps `anchor clean`):

```bash
uso clean
```

---

## Wallet & SOL Commands

All wallet commands wrap the native `solana` CLI and route through the WSL engine in Stealth Mode.

### Check Your Wallet Address

```bash
uso address
```

### Check SOL Balance

```bash
# Your default wallet
uso balance

# Any specific address
uso balance <WALLET_ADDRESS>
```

### Airdrop SOL (Devnet/Testnet)

```bash
# Airdrop to your default wallet
uso airdrop 2

# Airdrop to a specific address
uso airdrop 5 <WALLET_ADDRESS>
```

> Airdrops only work on devnet and testnet. Make sure your Solana CLI cluster is set to `devnet`:
> ```bash
> solana config set --url devnet
> ```

---

## Developer Tools

### Start a Local Validator

```bash
# Start with default settings
uso validator
# or shorthand:
uso val

# Reset the ledger and start fresh
uso val --reset

# Pass any solana-test-validator flags
uso val --bpf-program <PROGRAM_ID> <PROGRAM.so>
```

**On Windows:** If the validator fails with "Access Denied", USO automatically:
1. Spawns an elevated Administrator PowerShell window
2. Applies Windows Defender exclusions for `solana-test-validator`
3. Enables Developer Mode for symlink support

### Full Developer Mode

The all-in-one command for active development:

```bash
uso dev
```

This single command:
1. **Detects** if a local validator is already running
2. **Starts** the validator if none is running (waits up to 60s for it to be ready)
3. **Runs** your full test suite
4. **Watches** `programs/**/*.rs` and `tests/**/*.ts` for changes
5. **Auto-reruns** tests with a 2-second debounce on every save

Hit `Ctrl+C` to stop everything.

---

## Diagnostics & Verification

### Doctor

Inspect your environment for any issues:

```bash
uso doctor
```

Checks for:
- Git installation
- Rust & Cargo version
- Solana CLI version and PATH
- Anchor version
- WSL2 availability (Windows)
- C++ Build Tools (Windows)
- Existing wallet file

### Verify

Perform a real end-to-end verification — builds an actual test Anchor project to confirm everything works:

```bash
uso verify
```

Run this after `uso init` to confirm your environment is fully operational.

---

## Windows Security & Unblocking

If builds fail with `os error 4551` or "Application Control policy has blocked", files downloaded from the internet have a "Mark of the Web" (Zone.Identifier) that Windows treats as untrusted.

**Fix:**
```bash
uso unblock
```

This removes the Mark of the Web from all files in your project directory and `~/.cargo/bin`, allowing builds to proceed.

After unblocking:
```bash
uso test
```

**Alternative:** Use `uso init --wsl` (Stealth Mode) to sidestep all Windows security restrictions permanently.

---

## Uninstallation

### Interactive Full Removal

Guides you through removing all installed components with confirmation prompts:

```bash
uso uninstall
```

> ⚠️ **Wallet Warning:** The full uninstall will ask about your wallet at `~/.config/solana/id.json`. You must type `DELETE` to confirm its removal. **Back up your keypair first if it holds funds.**

### Remove Individual Components

```bash
uso uninstall rust
uso uninstall solana
uso uninstall anchor
```

### Remove USO Itself

```bash
npm uninstall -g @xaidenlabs/uso
```

---

## Command Reference

| Command | Alias | Description |
|---|---|---|
| `uso init` | `uso setup` | Install full stack (Rust + Solana + Anchor) |
| `uso init --wsl` | — | Install via hidden WSL2 Stealth Engine (Windows) |
| `uso init rust` | `uso install rust` | Install Rust only |
| `uso init solana` | `uso install solana` | Install Solana CLI only |
| `uso init anchor` | `uso install anchor` | Install Anchor Framework only |
| `uso doctor` | — | Diagnose environment |
| `uso verify` | — | End-to-end verification build |
| `uso create <name>` | — | Scaffold a new Anchor project |
| `uso build` | — | Build program (`anchor build`) |
| `uso test [args]` | — | Run tests (`anchor test`) |
| `uso deploy` | — | Deploy program (`anchor deploy`) |
| `uso clean` | — | Clean artifacts (`anchor clean`) |
| `uso address` | — | Show wallet address |
| `uso balance [addr]` | — | Show SOL balance |
| `uso airdrop <n> [addr]` | — | Airdrop SOL (devnet/testnet) |
| `uso validator [flags]` | `uso val` | Start local test validator |
| `uso dev` | — | Full dev mode (validator + watcher + tests) |
| `uso unblock` | — | Remove Mark-of-the-Web (Windows) |
| `uso uninstall [comp]` | — | Remove installed toolchains |

---

## Troubleshooting

**"Command not found" after install**
> Restart your terminal. PATH changes require a new session to take effect.

**"Permission Denied" / `os error 1314`**
> Run from an Administrator terminal, or use `uso init --wsl` to avoid this entirely.

**`os error 4551` / Smart App Control**
> Run `uso unblock` then retry. Or switch to `uso init --wsl`.

**Rust fails to install on Windows**
> You need the "Desktop development with C++" workload from Visual Studio Build Tools. Download at [visualstudio.microsoft.com/visual-cpp-build-tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

**`uso test` hangs on Windows**
> USO auto-detects this but if it still hangs, start the validator manually first:
> ```bash
> uso val
> # in another terminal:
> uso test
> ```

**Anchor version mismatch errors**
> ```bash
> uso clean
> uso build
> ```

**Nothing helps**
> Run `uso doctor` and share the output to diagnose.

---

**Developed by [Xaiden Labs](https://xaidenlabs.com)**
