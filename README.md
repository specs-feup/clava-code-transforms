# clava-project-template

A template for developing projects for Clava in Typescript

## Installing dev environment

Execute the following commands to download all the required code:

```bash
npm install
```

## Executing Clava-JS

You can execute your project in Clava by running the following on your terminal

```bash
npm run run
```

Take a look inside the `scripts` field in the `package.json` file for more information.

You can also run tests, get test coverage information and generate documentation for your project.

## Debugging

You can get debugging information using a `DEBUG` environment variable.
This variable is used by the [debug](https://www.npmjs.com/package/debug) module to determine what to expose.

```bash
DEBUG="*" npm run run
```
