const core = require('@actions/core');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

        const fileMap = await scanFilesWithTimestamps(brewPaths);
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
 * Recursively scan directories and collect file/symlink info with timestamps
 * @param {string[]} basePaths - Array of base paths to scan
 * @returns {Promise<Map<string, number>>} Map of filepath -> mtime timestamp
 */
async function scanFilesWithTimestamps(basePaths) {
    const fileMap = new Map();

    for (const basePath of basePaths) {
        try {
            // Check if path exists
            await fs.promises.access(basePath);
            await scanDirectory(basePath, fileMap);
        } catch (error) {
            core.info(`Skipping ${basePath}: ${error.message}`);
        }
    }

    return fileMap;
}

/**
 * Recursively scan a single directory
 * @param {string} dirPath - Directory to scan
 * @param {Map<string, number>} fileMap - Map to populate with results
 */
async function scanDirectory(dirPath, fileMap) {
    try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            try {
                const stats = await fs.promises.lstat(fullPath); // lstat to handle symlinks

                if (entry.isFile() || entry.isSymbolicLink()) {
                    // Store file or symlink with its mtime
                    fileMap.set(fullPath, stats.mtimeMs);
                } else if (entry.isDirectory()) {
                    // Store directory with its mtime
                    fileMap.set(fullPath, stats.mtimeMs);
                    // Recursively scan subdirectory
                    await scanDirectory(fullPath, fileMap);
                }
            } catch (error) {
                // Skip files/dirs we can't access (permissions, broken symlinks, etc.)
                core.debug(`Skipping ${fullPath}: ${error.message}`);
            }
        }
    } catch (error) {
        core.warning(`Failed to scan directory ${dirPath}: ${error.message}`);
    }
}

/**
 * Generate a stable hash from the file timestamp map
 * @param {Map<string, number>} fileMap - Map of filepath -> timestamp
 * @returns {string} Stable hash representing the file state
 */
function generateStableHash(fileMap) {
    // Return special hash for empty map
    if (fileMap.size === 0) {
        return '000000000000';
    }

    // Convert map to sorted array of [path, timestamp] pairs for stability
    // Use locale-independent comparison for deterministic sorting
    const sortedEntries = Array.from(fileMap.entries())
        .sort(([pathA], [pathB]) => {
            if (pathA < pathB) return -1;
            if (pathA > pathB) return 1;
            return 0;
        });

    // Create a string representation
    const content = sortedEntries
        .map(([path, timestamp]) => `${path}:${timestamp}`)
        .join('\n');

    // Generate SHA-256 hash and truncate to 12 characters for readability
    const hash = crypto.createHash('sha256')
        .update(content)
        .digest('hex')
        .substring(0, 12);

    return hash;
}

run();
