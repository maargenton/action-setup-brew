const core = require('@actions/core');
const os = require('os');
const brew = require('./brew');

async function run() {
    try {
        const platform = os.platform();

        if (platform === 'win32') {
            core.warning('Homebrew is not supported on Windows, skipping setup');
            return;
        }

        const cacheRestored = await brew.restoreCache();
        if (cacheRestored) {
            await brew.setupEnv();
        } else {
            const isBrewAvailable = await brew.checkAvailability();
            if (!isBrewAvailable) {
                await brew.installBrew();
            }
            await brew.setupEnv();
        }

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

run();
