// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const config = {
    presets: [
        ['@babel/preset-env', {
            targets: {
                chrome: 66,
                firefox: 60,
                edge: 42,
                safari: 12,
            },
            modules: false,
            corejs: 3,
            debug: false,
            useBuiltIns: 'usage',
            shippedProposals: true,
        }],

        // Classic runtime on purpose: JSX compiles to React.createElement on the host
        // webapp's React (17 on 10.11, 18 on 11.x, 19 on 12.x). The automatic runtime
        // would need window.ReactJSXRuntime, which only the v12 webapp provides.
        ['@babel/preset-react', {
            runtime: 'classic',
            useBuiltIns: true,
        }],
        ['@babel/typescript', {
            allExtensions: true,
            isTSX: true,
        }],
    ],
    plugins: [],
};

// Jest needs module transformation
config.env = {
    test: {
        presets: config.presets,
        plugins: config.plugins,
    },
};
config.env.test.presets[0][1].modules = 'auto';

module.exports = config;
