#!/usr/bin/env node
const { program } = require('commander');
const { init } = require('../src/commands/init');
const { doctor } = require('../src/commands/doctor');
const { verify } = require('../src/commands/verify');
const { create } = require('../src/commands/create');
const { build, test, deploy, clean, unblock, airdrop, address, balance, validator, dev } = require('../src/commands/workflow');
const { uninstall } = require('../src/commands/uninstall');

program
    .name('uso')
    .description('Universal Solana Orchestrator - One-command setup for all OS')
    .version(require('../package.json').version);

program
    .command('init [component]')
    .alias('install')
    .description('Install Rust, Solana CLI, Anchor Framework, or specific component (rust, solana, anchor)')
    .option('--wsl', 'Install in Stealth WSL Mode (Windows Only)')
    .action(init);

program
    .command('setup [component]')
    .description('Alias for init (Install components)')
    .option('--wsl', 'Install in Stealth WSL Mode (Windows Only)')
    .action(init);

program
    .command('doctor')
    .description('Check if the environment is ready for Solana development')
    .action(doctor);

program
    .command('verify')
    .description('Verify installation by building a test Anchor project')
    .action(verify);


program
    .command('build')
    .description('Build the Anchor project (wraps "anchor build")')
    .action(build);

program
    .command('test [args...]')
    .description('Run Anchor tests (wraps "anchor test")')
    .allowUnknownOption()
    .action(test);

program
    .command('deploy')
    .description('Deploy the program (wraps "anchor deploy")')
    .action(deploy);

program
    .command('airdrop <amount> [recipient]')
    .description('Airdrop SOL to a wallet (wraps "solana airdrop")')
    .action(airdrop);

program
    .command('address')
    .description('Show your wallet address (wraps "solana address")')
    .action(address);

program
    .command('balance [address]')
    .description('Show SOL balance (wraps "solana balance")')
    .action(balance);

program
    .command('validator [args...]')
    .alias('val')
    .description('Start local Solana validator (wraps "solana-test-validator")')
    .allowUnknownOption() // Allow flags like --reset
    .action(validator);

program
    .command('create <projectName>')
    .description('Scaffold a new Solana project with Next.js frontend')
    .action(create);

program
    .command('dev')
    .description('Start developer mode (Validator + Watcher)')
    .action(dev);

program
    .command('clean')
    .description('Clean the project (wraps "anchor clean")')
    .action(clean);

program
    .command('unblock')
    .description('Unblock files (remove Mark-of-the-Web) to fix Windows build errors')
    .action(unblock);

program
    .command('uninstall [component]')
    .description('Uninstall uso components (rust, solana, anchor) or all')
    .action(uninstall);

program.parse(process.argv);
