const core = require('@actions/core');
const exec = require('@actions/exec');
const cache = require('@actions/cache');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

async function run() {
    try {
        const platform = os.platform();

        // Skip on Windows
        if (platform === 'win32') {
            core.info('Skipping Homebrew setup on Windows');
            return;
        }

        core.info(`Setting up Homebrew on ${platform}`);

        // Get inputs
        const packages = core.getInput('packages');

        // Define cache paths (exactly as in original actions)
        const cachePaths = [
            '/home/linuxbrew/.linuxbrew',
            '/opt/homebrew',
            '/usr/local/Homebrew'
        ];

        // Try to restore cache with the original key pattern
        const restoreKey = `brew-${platform === 'darwin' ? 'macOS' : 'Linux'}-latest`;
        const restoreKeys = [`brew-${platform === 'darwin' ? 'macOS' : 'Linux'}-`];

        core.info(`Attempting to restore cache with key: ${restoreKey}`);
        const cacheMatchedKey = await cache.restoreCache(cachePaths, restoreKey, restoreKeys);

        if (cacheMatchedKey) {
            core.info(`Cache restored from key: ${cacheMatchedKey}`);
        } else {
            core.info('No cache found');
        }

        // Install Homebrew if needed
        await setupHomebrew(platform, cacheMatchedKey);

        // Install packages if specified
        if (packages.trim()) {
            await installPackages(packages);
        }

        // Save the matched cache key for post action
        core.saveState('cache-matched-key', cacheMatchedKey || '');
        core.saveState('runner-os', platform === 'darwin' ? 'macOS' : 'Linux');

    } catch (error) {
        core.setFailed(error.message);
    }
}

async function setupHomebrew(platform, cacheMatchedKey) {
    const isBrewAvailable = await checkBrewAvailable();

    if (platform === 'darwin') {
        // macOS
        if (!isBrewAvailable) {
            if (cacheMatchedKey) {
                core.info('Homebrew restored from cache');
            } else {
                core.info('Installing Homebrew...');
                await exec.exec('/bin/bash', ['-c',
                    '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
                ]);
            }
        } else {
            core.info('Homebrew already available');
        }

        // Ensure Homebrew is in PATH (handle both Apple Silicon and Intel)
        if (fs.existsSync('/opt/homebrew/bin')) {
            core.addPath('/opt/homebrew/bin');
            core.addPath('/opt/homebrew/sbin');
        } else if (fs.existsSync('/usr/local/bin')) {
            core.addPath('/usr/local/bin');
            core.addPath('/usr/local/sbin');
        }

        // Set Homebrew environment variables for non-interactive use
        core.exportVariable('HOMEBREW_NO_AUTO_UPDATE', '1');
        core.exportVariable('HOMEBREW_NO_INSTALL_CLEANUP', '1');
        core.exportVariable('HOMEBREW_NO_ANALYTICS', '1');

    } else if (platform === 'linux') {
        // Linux
        if (!isBrewAvailable) {
            if (cacheMatchedKey) {
                core.info('Linuxbrew restored from cache');
            } else {
                core.info('Installing Linuxbrew...');
                await exec.exec('/bin/bash', ['-c',
                    '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
                ]);
            }
        } else {
            core.info('Linuxbrew already available');
        }

        // Ensure Linuxbrew is in PATH
        if (fs.existsSync('/home/linuxbrew/.linuxbrew/bin')) {
            core.addPath('/home/linuxbrew/.linuxbrew/bin');
            core.addPath('/home/linuxbrew/.linuxbrew/sbin');

            // Set Homebrew environment variables for non-interactive use
            core.exportVariable('HOMEBREW_NO_AUTO_UPDATE', '1');
            core.exportVariable('HOMEBREW_NO_INSTALL_CLEANUP', '1');
            core.exportVariable('HOMEBREW_NO_ANALYTICS', '1');
        }
    }
}

async function checkBrewAvailable() {
    try {
        await exec.exec('brew', ['--version'], { silent: true });
        return true;
    } catch (error) {
        return false;
    }
}

async function installPackages(packages) {
    const packageList = packages
        .split(/[\s\n]+/)
        .filter(pkg => pkg.trim())
        .map(pkg => pkg.trim());

    if (packageList.length === 0) {
        return;
    }

    core.info(`Installing packages: ${packageList.join(', ')}`);

    for (const pkg of packageList) {
        try {
            await exec.exec('brew', ['install', pkg]);
        } catch (error) {
            core.warning(`Failed to install package: ${pkg}`);
            // Continue with other packages
        }
    }
}

run();
