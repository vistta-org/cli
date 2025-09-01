# **Vistta CLI**

Vistta CLI is a framework for extending the Node.js loader API and building reusable, customizable commands tools.
It enables you to create custom loaders, and define your own commands for any projects.
Compatible with either jsconfig or tsconfig json files.

## Features

- **Custom Loaders:** Register and use your own file loaders for any extension or import attribute.
- **Custom Commands:** Create custom commands by extending the Command class or any other and wiring them into your project.

## Getting Started

### Installation

```sh
npm install @vistta/cli
```

## Usage

### Built-in Commands

- `vistta`
  Runs the default command, which can be configured in your project's `jsconfig.json` or `tsconfig.json`.

- `vistta bundle <filename> [outdir]`  
  Bundle an entry file and its dependencies.

- `vistta project name`
  Outputs the current project name from `package.json`.

- `vistta project version [major|minor|patch]`  
  Outputs the current project version. If a level (`major`, `minor`, `patch`) is provided, it increments the version accordingly.

- `vistta project outdated`  
  Lists all outdated dependencies in the project.

- `vistta patch [module-name]` or `vistta project patch [module-name]`
  Updates the version of a specific module (or all outdated modules if none is specified) to the latest patch version in `package.json`.

- `vistta update [module-name]` or `vistta project update [module-name]`
  Updates the version of a specific module (or all outdated modules if none is specified) to its latest available version in `package.json`.

- `vistta test [pattern]`  
  Run tests matching the specified pattern.

## Extending the CLI

You can create custom loaders and commands to fit your workflow.

### 1. Create a Custom Loader

```js
// my-loader.js
import { Loader } from "vistta/cli";

export default class MyLoader extends Loader {
  async load(...args) {
    // Your loader logic here
  }
}
```

### 2. Create a Custom CLI Command and Register the Loader

```js
// my-command.js
import { Command } from "vistta/cli";

export default class MyCommand extends Command {
  constructor(options) {
    super(options);
    // Register loaders, add resolvers, define env or global variables
    // this.register(path, { type, filter });
    // this.resolve("ts");
    // this.define("env"/"global", key, value);
  }

  async help(...args) {
    // Your command help logic here
  }

  async main(...args) {
    // Your command logic here
  }
}
```

### 3. Register Your Command in `jsconfig.json` or `tsconfig.json`

```json
{
  "extends": "@vistta/cli/config", // Optional/Recomended
  "cli": {
    "commands": {
      "my-command": "./cli/my-command.js"
    }
  }
}
```

### 4. Run Your Custom Command

```sh
vistta my-command [options]
```

## **License**

Apache 2.0 with Commons Clause

## **Contributing**

Thank you for your interest in contributing to this project! Please ensure that any contributions respect the licensing terms specified. If you encounter any issues or have suggestions, feel free to report them. All issues will be well received and addressed to thQe best of our ability. We appreciate your support and contributions!

### **Authors**

- [Tiago Terenas Almeida](https://github.com/tiagomta)
