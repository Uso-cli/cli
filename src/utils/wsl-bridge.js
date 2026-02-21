const shell = require('shelljs');
const path = require('path');
const os = require('os');
const { log } = require('./logger');

/**
 * Checks if WSL is installed and enabled.
 */
const isWslInstalled = () => {
    if (os.platform() !== 'win32') return false;
    const res = shell.exec('wsl --status', { silent: true });
    return res.code === 0;
};

/**
 * Checks if a specific distro is installed.
 * @param {string} distro Name of the distro (e.g., "Ubuntu")
 */
const isDistroInstalled = (distro = 'Ubuntu') => {
    if (os.platform() !== 'win32') return false;
    // wsl --list --quiet returns names only, utf-16le encoded often in PowerShell.
    // simpler to use wsl -l -v and check output
    const res = shell.exec('wsl -l -v', { silent: true });
    return res.stdout.includes(distro) || res.stderr.includes(distro); // sometimes stderr depending on version
};

/**
 * Converts a Windows path (C:\Users\...) to a WSL path (/mnt/c/Users/...).
 * @param {string} windowsPath 
 */
const toWslPath = (windowsPath) => {
    if (!windowsPath) return '';
    // 1. Normalize the path to use forward slashes
    let normalized = windowsPath.replace(/\\/g, '/');

    // 2. Extract and replace the drive letter (e.g., 'C:') with '/mnt/c/'
    // This regex ensures we only match the start of the string
    normalized = normalized.replace(/^([a-zA-Z]):/, (match, drive) => `/mnt/${drive.toLowerCase()}`);

    return normalized;
};

/**
 * Runs a command inside the default WSL distro (or specified one).
 * @param {string} command The shell command to run in Linux
 * @param {object} options { distro: 'Ubuntu', cwd: 'C:\\...', interactive: false }
 */
const runWsl = (command, options = {}) => {
    const distro = options.distro || 'Ubuntu';
    const cwd = options.cwd ? toWslPath(options.cwd) : '';

    // Construct the WSL command
    // wsl -d Ubuntu -e bash -c "cd /mnt/c/... && <command>"

    let wslCmd = `wsl -d ${distro}`;

    if (options.user) {
        wslCmd += ` -u ${options.user}`;
    }

    // Prepare the bash script
    let bashScript = '';
    if (cwd) {
        bashScript += `cd "${cwd}" && `;
    }
    bashScript += command;

    // Execute
    // Note: We use shell.exec. If interactive, maybe spawn?
    // For "Stealth Mode", we usually want to capture output or just run it.

    // Escape double quotes for the -c argument
    const escapedScript = bashScript.replace(/"/g, '\\"');

    const fullCmd = `${wslCmd} -e bash -c "${escapedScript}"`;

    // log.info(`[WSL Bridge] Executing: ${fullCmd}`); // Debug

    return shell.exec(fullCmd, options.execOpts || {});
};

module.exports = {
    isWslInstalled,
    isDistroInstalled,
    toWslPath,
    runWsl
};
