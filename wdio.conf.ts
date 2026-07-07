export const config: WebdriverIO.Config = {
    runner: 'local',
    tsNodeOpts: { project: './tests/e2e/mobile/tsconfig.json' },
    specs: ['./tests/e2e/mobile/**/appium-*.test.ts'],
    maxInstances: 1,
    capabilities: [{
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        // 'appium:app': './path/to/app.apk', 
    }],
    logLevel: 'info',
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: { ui: 'bdd', timeout: 60000 }
};
