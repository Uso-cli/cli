const shell = require('shelljs');
const { log, spinner } = require('../utils/logger');

const runProxyCommand = async (command, args = []) => {
    // Check if anchor is available
    if (!shell.which('anchor')) {
        log.error("❌ Anchor is not found in PATH.");
        log.warn("👉 Run 'uso init' (or 'uso install') to set up your environment.");
        return;
    }

    const fullCommand = `anchor ${command} ${args.join(' ')}`;
    log.header(`🚀 Running: ${fullCommand}`);

    const execution = shell.exec(fullCommand);

    if (execution.code === 0) {
        log.success(`✅ '${command}' completed successfully.`);
    } else {
        log.error(`❌ '${command}' failed.`);
        // We don't exit process here strictly, but let the user know
    }
};

const build = () => runProxyCommand('build');
const test = () => runProxyCommand('test');
const deploy = () => runProxyCommand('deploy');
const clean = () => runProxyCommand('clean');

// Generic run command for other anchor commands? 
// For now, explicit functions are safer for help generation.

module.exports = {
    build,
    test,
    deploy,
    clean
};
