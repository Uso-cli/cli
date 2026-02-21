# Welcome to Your USO Project 🚀

Congratulations! You've just scaffolded a professional Solana workspace using the **Universal Solana Orchestrator (USO)**.

This isn't just a folder with files. It's a battle-tested setup ready for serious development.

## 📂 Structure
- `programs/`: Your Rust smart contracts live here.
- `tests/`: Robust TypeScript tests using Anchor.
- `Anchor.toml`: Your project configuration.

## ⚡ Quick Start

### 1. Build
Compile your smart contract:
```bash
uso build
```

### 2. Test
Run your test suite against a local validator:
```bash
uso test
```
*Note: This automatically spins up a local validator, deploys your program, runs tests, and shuts down.*

### 3. Deploy (Devnet)
When you're ready to go public:
1. Switch to devnet: `solana config set --url devnet`
2. Airdrop SOL: `solana airdrop 2`
3. Deploy: `uso deploy`

## 🧠 Need Help?
Run `uso doctor` if your environment feels weird. Usage instructions are also available via `uso help`.

Happy coding!
