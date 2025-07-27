const core = require('@actions/core');
const os = require('os');
const brew = require('./brew');

async function run() {
    try {
        const platform = os.platform();
        if (platform === 'win32') {
            return;
        }

        await brew.saveCache();

    } catch (error) {
        core.warning(`Post action failed: ${error.message}`);
    }
}

run();
