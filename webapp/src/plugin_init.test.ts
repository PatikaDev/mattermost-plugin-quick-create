/**
 * @jest-environment jsdom
 */
// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// A second initialize on the same instance (Mattermost re-enabling the plugin while its code is
// still loading) must not register anything again, or every icon shows up twice.
export {};

test('initialize registers once per instance, again after uninitialize', async () => {
    const registered: any[] = [];
    (window as any).registerPlugin = (_id: string, plugin: unknown) => registered.push(plugin);
    jest.isolateModules(() => {
        require('./index'); // eslint-disable-line global-require
    });
    const plugin = registered[0];

    const calls: string[] = [];
    const registry = new Proxy({}, {
        get: (_target, name) => () => {
            calls.push(String(name));
            return {showRHSPlugin: {}, hideRHSPlugin: {}, toggleRHSPlugin: {}, id: 'x'};
        },
    });
    const store = {dispatch: jest.fn(), getState: () => ({}), subscribe: jest.fn(() => () => undefined)};

    await plugin.initialize(registry, store);
    const once = calls.length;
    expect(once).toBeGreaterThan(0);

    await plugin.initialize(registry, store);
    expect(calls.length).toBe(once);

    plugin.uninitialize();
    await plugin.initialize(registry, store);
    expect(calls.length).toBe(once * 2);
});
