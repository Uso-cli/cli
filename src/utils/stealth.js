const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Checks if Stealth WSL Mode is enabled.
 * Reads ~/.uso-config.json and returns the mode configuration.
 * @returns {{ enabled: boolean, distro: string }}
 */
const isStealthMode = () => {
    try {
        const configPath = path.join(os.homedir(), '.uso-config.json');
        if (!fs.existsSync(configPath)) return { enabled: false, distro: 'Ubuntu' };

        const raw = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
        const config = JSON.parse(raw);
        return {
            enabled: config.mode === 'wsl',
            distro: config.distro || 'Ubuntu'
        };
    } catch (e) {
        return { enabled: false, distro: 'Ubuntu' };
    }
};

module.exports = { isStealthMode };
