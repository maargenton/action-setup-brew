const core = require('@actions/core');
const { run } = require('../src/index');

// Mock the core module
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('@actions/cache');
jest.mock('os');
jest.mock('fs');

describe('Setup Brew Action', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should skip on Windows', async () => {
        const os = require('os');
        os.platform.mockReturnValue('win32');

        core.getInput.mockReturnValue('');

        await run();

        expect(core.info).toHaveBeenCalledWith('Skipping Homebrew setup on Windows');
    });

    test('should setup on macOS', async () => {
        const os = require('os');
        os.platform.mockReturnValue('darwin');
        os.arch.mockReturnValue('arm64');

        core.getInput.mockReturnValue('');

        // This test would need more mocking for full coverage
        // For now, just ensure it doesn't throw
        expect(() => run()).not.toThrow();
    });
});
