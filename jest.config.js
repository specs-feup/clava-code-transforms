import { weaverConfig } from "clava-js/code/WeaverConfiguration.js";

const config = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "lara-js/jest/jestEnvironment.js",
  testEnvironmentOptions: {
    weaverConfig,
  },
  globalSetup: "lara-js/jest/jestGlobalSetup.js",
  globalTeardown: "lara-js/jest/jestGlobalTeardown.js",
  setupFiles: ["lara-js/jest/setupFiles/sharedJavaModule.js"],
  //notify: true,
  //notifyMode: "always",
  //verbose: true,
  collectCoverage: false,
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  collectCoverageFrom: ["src/**/*[^.d].(t|j)s"],
  coverageProvider: "v8",
  moduleNameMapper: {
    "(.+)\\.js": "$1",
  }
};

export default config;
