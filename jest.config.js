// import { weaverConfig } from "@specs-feup/clava/code/WeaverConfiguration.js";

// const config = {
//     preset: "ts-jest/presets/default-esm",
//     testEnvironment: "@specs-feup/lara/jest/jestEnvironment.js",
//     testEnvironmentOptions: {
//         weaverConfig,
//     },
//     globalSetup: "@specs-feup/lara/jest/jestGlobalSetup.js",
//     globalTeardown: "@specs-feup/lara/jest/jestGlobalTeardown.js",
//     setupFiles: ["@specs-feup/lara/jest/setupFiles/sharedJavaModule.js"],
//     //notify: true,
//     //notifyMode: "always",
//     //verbose: true,
//     collectCoverage: false,
//     coverageDirectory: "coverage",
//     coverageReporters: ["text", "lcov"],
//     collectCoverageFrom: ["src/**/*[^.d].(t|j)s"],
//     coverageProvider: "v8",
//     moduleNameMapper: {
//         "(.+)\\.js": "$1",
//     }
// };

// export default config;


// jest.config.mjs
import { weaverConfig } from "@specs-feup/clava/code/WeaverConfiguration.js";

/** @type {import('ts-jest').InitialOptionsTsJest} */
export default {
    preset: 'ts-jest/presets/default-esm',
    transform: {
        '^.+\\.ts$': ['ts-jest', { useESM: true }],
    },
    extensionsToTreatAsEsm: ['.ts'],
    testEnvironment: '@specs-feup/lara/jest/jestEnvironment.js',
    testEnvironmentOptions: {
        weaverConfig,
    },
    globalSetup: '@specs-feup/lara/jest/jestGlobalSetup.js',
    globalTeardown: '@specs-feup/lara/jest/jestGlobalTeardown.js',
    setupFiles: ['@specs-feup/lara/jest/setupFiles/sharedJavaModule.js'],
    collectCoverage: false,
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    collectCoverageFrom: ['src/**/*[^.d].(t|j)s'],
    coverageProvider: 'v8',
    moduleNameMapper: {
        '(.+)\\.js': '$1',
    },
};
