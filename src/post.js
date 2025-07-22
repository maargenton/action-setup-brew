const core = require('@actions/core');
const cache = require('@actions/cache');
const exec = require('@actions/exec');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

async function run() {
    try {
        const platform = os.platform();

        // Skip on Windows
        if (platform === 'win32') {
            core.info('Skipping cache save on Windows');
            return;
        }

        // Get saved state from main action
        const cacheMatchedKey = core.getState('cache-matched-key');
        const runnerOS = core.getState('runner-os');

        // Generate Homebrew state hash (exactly as in original save action)
        const isBrewAvailable = await checkBrewAvailable();

        if (!isBrewAvailable) {
            core.info('Homebrew not found, skipping cache save');
            return;
        }

        core.info('Generating Homebrew state hash...');

        // Create state file exactly as in original
        const stateContent = await generateBrewState();
        const brewStateHash = crypto.createHash('sha256').update(stateContent).digest('hex');

        // Check if state has changed by comparing with cached key
        const brewNewCacheKey = `brew-${runnerOS}-${brewStateHash}`;

        if (cacheMatchedKey === brewNewCacheKey) {
            core.info('Homebrew state unchanged, skipping cache save');
            core.info(`Previous key: ${cacheMatchedKey}`);
            core.info(`New key: ${brewNewCacheKey}`);
            return;
        }

        core.info('Homebrew state changed, will save new cache for');
        core.info(stateContent);
        core.info(`Previous key: ${cacheMatchedKey}`);
        core.info(`New key: ${brewNewCacheKey}`);

        // Save cache with the new key
        const cachePaths = [
            '/home/linuxbrew/.linuxbrew',
            '/opt/homebrew',
            '/usr/local/Homebrew'
        ];

        try {
            await cache.saveCache(cachePaths, brewNewCacheKey);
            core.info('Cache saved successfully');
        } catch (error) {
            core.warning(`Failed to save cache: ${error.message}`);
        }

    } catch (error) {
        core.warning(`Post action failed: ${error.message}`);
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

async function generateBrewState() {
    // Generate state exactly as in original save action
    let brewVersion = '';
    let brewList = '';

    try {
        // Get brew version
        let versionOutput = '';
        await exec.exec('brew', ['--version'], {
            listeners: {
                stdout: (data) => {
                    versionOutput += data.toString();
                }
            },
            silent: true
        });
        brewVersion = versionOutput.trim();

        // Get installed packages and versions, sorted
        let listOutput = '';
        await exec.exec('brew', ['list', '--versions'], {
            listeners: {
                stdout: (data) => {
                    listOutput += data.toString();
                }
            },
            silent: true
        });

        // Sort the output as in original
        brewList = listOutput.split('\n')
            .filter(line => line.trim())
            .sort()
            .join('\n');

    } catch (error) {
        core.warning(`Failed to generate brew state: ${error.message}`);
    }

    // Combine exactly as in original
    return `${brewVersion}\n\n${brewList}`;
}

run();
