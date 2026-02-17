#!/usr/bin/env node
const { program } = require('commander');
const { init } = require('../src/commands/init');
const { doctor } = require('../src/commands/doctor');
const { verify } = require('../src/commands/verify');
const { build, test, deploy, clean } = require('../src/commands/workflow');
const { uninstall } = require('../src/commands/uninstall');

program
    .name('uso')
    .description('Universal Solana Orchestrator - One-command setup for all OS')
    .version('1.0.0');

program
    .command('init [component]')
    .alias('install')
    .description('Install Rust, Solana CLI, Anchor Framework, or specific component (rust, solana, anchor)')
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
    .command('test')
    .description('Run Anchor tests (wraps "anchor test")')
    .action(test);

program
    .command('deploy')
    .description('Deploy the program (wraps "anchor deploy")')
    .action(deploy);

program
    .command('clean')
    .description('Clean the project (wraps "anchor clean")')
    .action(clean);

program
    .command('uninstall [component]')
    .description('Uninstall uso components (rust, solana, anchor) or all')
    .action(uninstall);

program.parse(process.argv);
