import {defineConfig} from '@playwright/test';

// Reminders are delivered by a server job that runs once a minute, so a few tests
// wait up to ~2.5 minutes for the real delivery instead of faking the clock.
export default defineConfig({
    testDir: './tests',
    timeout: 240_000,
    workers: 1,
    retries: 0,
    // In CI, also report failures as GitHub annotations so they're readable without the logs.
    reporter: process.env.CI ? [['list'], ['github']] : [['list']],
    use: {
        baseURL: 'http://localhost:8067',
        viewport: {width: 1400, height: 900},
        timezoneId: 'Europe/Istanbul',
        channel: 'chrome',
    },
});
