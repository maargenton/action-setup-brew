const core = require('@actions/core');
const exec = require('@actions/exec');
const cache = require('@actions/cache');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

const CACHE_PATHS = [
    '/home/linuxbrew/.linuxbrew',
    '/opt/homebrew',
    '/usr/local/Homebrew'
];

/**
 * Check if brew command is available and in PATH
 * @returns {Promise<boolean>} true if brew is available
 */
async function checkAvailability() {
    try {
        await exec.exec('brew', ['--version'], { silent: true });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Generate the hash part of the cache key based on brew version and installed
 * packages.
 * @returns {Promise<string>} The state hash for the cache key
 */
async function stateHash() {
    try {
        let versionOutput = '';
        await exec.exec('brew', ['--version'], {
            listeners: {
                stdout: (data) => {
                    versionOutput += data.toString();
                }
            },
            silent: true
        });
        versionOutput = versionOutput.trim();

        let listOutput = '';
        await exec.exec('brew', ['list', '--versions'], {
            listeners: {
                stdout: (data) => {
                    listOutput += data.toString();
                }
            },
            silent: true
        });

        const stateContent = versionOutput + '\n\n' +
            listOutput.split('\n').filter(line => line.trim()).sort().join('\n');
        const hash = crypto.createHash('sha256').update(stateContent)
            .digest('hex').substring(0, 12);
        return hash

    } catch (error) {
        core.warning(`Failed to generate brew state hash: ${error.message}`);
        return '';
    }
}

/**
 * Generate cache key based on OS, arch, and optional hash
 * @param {string|null} hash - The state hash, if null/empty returns "latest" key
 * @returns {string} The resulting cache key "brew-{platform}-{arch}-{hash || 'latest'}"
 */
function cacheKey(hash) {
    const platform = os.platform();
    const arch = os.arch();

    if (!hash || hash.trim() === '') {
        return `brew-${platform}-${arch}-`;
    } else {
        return `brew-${platform}-${arch}-${hash}`;
    }
}

/**
 * Restore brew from cache using cache key pattern from setup-brew action
 * @returns {Promise<string|null>} The matched cache key or null if no cache found
 */
async function restoreCache() {
    const key = cacheKey();
    const restoreKey = key + 'latest';
    const restoreKeys = [key];

    core.info(`Attempting to restore cache with key: ${restoreKey}`);

    try {
        const cacheMatchedKey = await cache.restoreCache(CACHE_PATHS, restoreKey, restoreKeys);

        if (cacheMatchedKey) {
            core.info(`Cache restored from key: ${cacheMatchedKey}`);
            core.saveState('restored-cache-key', cacheMatchedKey);
            return cacheMatchedKey;
        } else {
            core.info('No cache found');
            core.saveState('restored-cache-key', '');
            return null;
        }
    } catch (error) {
        core.warning(`Cache restore failed: ${error.message}`);
        core.saveState('restored-cache-key', '');
        return null;
    }
}

/**
 * Run brew install script for macOS / Linux
 */
async function installBrew() {
    const platform = os.platform();

    if (platform === 'darwin') {
        core.info('Installing Homebrew...');
    } else if (platform === 'linux') {
        core.info('Installing Linuxbrew...');
    } else {
        throw new Error(`Unsupported platform: ${platform}`);
    }

    await exec.exec('/bin/bash', ['-c',
        '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    ]);
}

/**
 * Setup brew environment for both local env and subsequent action steps
 */
async function setupEnv() {
    const platform = os.platform();

    if (platform === 'darwin') {
        try {
            await fs.promises.access('/opt/homebrew/bin');
            core.addPath('/opt/homebrew/bin');
            core.addPath('/opt/homebrew/sbin');
        } catch {
            try {
                await fs.promises.access('/usr/local/bin');
                core.addPath('/usr/local/bin');
                core.addPath('/usr/local/sbin');
            } catch {
                // /usr/local/bin doesn't exist, skip adding to PATH
            }
        }

        core.exportVariable('HOMEBREW_NO_AUTO_UPDATE', '1');
        core.exportVariable('HOMEBREW_NO_INSTALL_CLEANUP', '1');
        core.exportVariable('HOMEBREW_NO_ANALYTICS', '1');

    } else if (platform === 'linux') {
        try {
            await fs.promises.access('/home/linuxbrew/.linuxbrew/bin');
            core.addPath('/home/linuxbrew/.linuxbrew/bin');
            core.addPath('/home/linuxbrew/.linuxbrew/sbin');

            core.exportVariable('HOMEBREW_NO_AUTO_UPDATE', '1');
            core.exportVariable('HOMEBREW_NO_INSTALL_CLEANUP', '1');
            core.exportVariable('HOMEBREW_NO_ANALYTICS', '1');
        } catch {
            // Linuxbrew paths don't exist, skip adding to PATH
        }
    }
}

/**
 * Update brew to the latest version
 */
async function updateBrew() {
    core.info('Updating Homebrew...');

    try {
        await exec.exec('brew', ['update']);
        core.info('Homebrew update completed');
    } catch (error) {
        core.warning(`Failed to update Homebrew: ${error.message}`);
        throw error;
    }
}

/**
 * Install packages using brew with --quiet flag
 * @param {string[]} packages - Array of package names to install
 */
async function installPackages(packages) {
    if (!packages || packages.length === 0) {
        core.info('No packages to install');
        return;
    }

    core.info(`Installing packages: ${packages.join(', ')}`);

    try {
        await exec.exec('brew', ['install', '--quiet', ...packages]);
        core.info('Package installation completed');
    } catch (error) {
        core.setFailed(`Failed to install packages: ${error.message}`);
        throw error;
    }
}

/**
 * Save current brew state to cache
 * @returns {Promise<void>}
 */
async function saveCache() {
    try {
        const hash = await stateHash();
        const key = cacheKey(hash);

        const restoredCacheKey = core.getState('restored-cache-key');

        if (restoredCacheKey && key === restoredCacheKey) {
            core.info(`Cache key unchanged (${key}), skipping save`);
            return;
        }

        core.info(`Saving cache with key: ${key}`);

        await cache.saveCache(CACHE_PATHS, key);
        core.info('Cache saved successfully');
    } catch (error) {
        core.warning(`Failed to save cache: ${error.message}`);
    }
}

module.exports = {
    checkAvailability,
    restoreCache,
    installBrew,
    setupEnv,
    updateBrew,
    installPackages,
    saveCache
};
