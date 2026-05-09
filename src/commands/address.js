const shell = require('shelljs');
const os = require('os');
const { log } = require('../utils/logger');
const { isStealthMode } = require('../utils/stealth');
const { runWsl } = require('../utils/wsl-bridge');

const address = async () => {
    const stealth = isStealthMode();
    
    try {
        let result;
        
        if (stealth.enabled) {
            // Run solana address inside WSL
            result = runWsl('solana address', { distro: stealth.distro });
        } else {
            // Run solana address natively
            result = shell.exec('solana address', { silent: true });
        }
        
        if (result.code === 0) {
            log.success(result.stdout.trim());
        } else {
            const errorMsg = result.stderr || result.stdout;
            log.error(errorMsg.trim());
        }
    } catch (e) {
        log.error(`Error getting wallet address: ${e.message}`);
    }
};

module.exports = { address };
