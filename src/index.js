const core = require('@actions/core');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const exec = require('@actions/exec');
const brew = require('./brew');

async function run() {
    try {
        const platform = os.platform();

        if (platform === 'win32') {
            core.warning('Homebrew is not supported on Windows, skipping setup');
            return;
        }

        // Prototype: Test differential cache functions
        const brewPaths = [
            '/home/linuxbrew/.linuxbrew',
            '/opt/homebrew',
            '/usr/local'
        ];

        core.info('Starting file scan for differential cache prototype...');
        const startTime = Date.now();

        const fileMap = await scanFiles(brewPaths);
        const scanDuration = Date.now() - startTime;

        const stableHash = generateStableHash(fileMap);

        core.info(`=== Differential Cache Prototype Results ===`);
        core.info(`Files/directories scanned: ${fileMap.size}`);
        core.info(`Scan duration: ${scanDuration}ms`);
        core.info(`Stable hash: ${stableHash}`);
        core.info(`============================================`);

        const cacheRestored = await brew.restoreCache();
        if (cacheRestored) {
            await brew.setupEnv();
        } else {
            const isBrewAvailable = await brew.checkAvailability();
            if (!isBrewAvailable) {
                await brew.installBrew();
            } else {
                core.info('Homebrew is already installed');
            }
            await brew.setupEnv();
        }

        await brew.updateBrew();

        const packages = core.getInput('packages');
        if (packages && packages.trim()) {
            const packageList = packages
                .split(/[\s\n]+/)
                .filter(pkg => pkg.trim())
                .map(pkg => pkg.trim());

            if (packageList.length > 0) {
                await brew.installPackages(packageList);
            }
        }

    } catch (error) {
        core.setFailed(error.message);
    }
}

/**
 * Fast file scanning using native find + stat commands
 * @param {string[]} basePaths - Array of base paths to scan
 * @returns {Promise<Map<string, number>>} Map of filepath -> mtime timestamp
 */
async function scanFiles(basePaths) {
    const fileMap = new Map();

    // Filter existing paths
    const existingPaths = [];
    for (const basePath of basePaths) {
        try {
            await fs.promises.access(basePath);
            existingPaths.push(basePath);
        } catch {
            core.info(`Skipping non-existent path: ${basePath}`);
        }
    }

    if (existingPaths.length === 0) {
        return fileMap;
    }

    let output = '';
    const platform = os.platform();

    // Platform-specific stat format options
    const statFormatOpts = platform === 'darwin'
        ? ['-f', '%N:%m']  // BSD stat format
        : ['-c', '%n:%Y']; // GNU stat format

    try {
        await exec.exec('find', [
            ...existingPaths,
            '(', '-type', 'f', '-o', '-type', 'l', ')',
            '-exec', 'stat', '-L', ...statFormatOpts, '{}', '+'
        ], {
            listeners: {
                stdout: (data) => output += data.toString()
            },
            silent: true,
            ignoreReturnCode: true
        });

        output.split('\n').forEach(line => {
            if (line.trim()) {
                const lastColon = line.lastIndexOf(':');
                if (lastColon > 0) {
                    const path = line.substring(0, lastColon);
                    const timestamp = parseInt(line.substring(lastColon + 1)) * 1000; // Convert to ms
                    if (!isNaN(timestamp)) {
                        fileMap.set(path, timestamp);
                    }
                }
            }
        });

    } catch (error) {
        core.warning(`Fast scan failed: ${error.message}`);
    }

    return fileMap;
}

/**
 * Generate a stable hash from the file timestamp map
 * @param {Map<string, number>} fileMap - Map of filepath -> timestamp
 * @returns {string} Stable hash representing the file state
 */
function generateStableHash(fileMap) {
    if (fileMap.size === 0) {
        return '000000000000';
    }

    const sortedEntries = Array.from(fileMap.entries())
        .sort(([pathA], [pathB]) => {
            if (pathA < pathB) return -1;
            if (pathA > pathB) return 1;
            return 0;
        });

    const content = sortedEntries
        .map(([path, timestamp]) => `${path}:${timestamp}`)
        .join('\n');

    const hash = crypto.createHash('sha256')
        .update(content)
        .digest('hex')
        .substring(0, 12);

    return hash;
}

run();
