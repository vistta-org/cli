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

- `vistta check [patterns] [--fix]`
  Runs the enabled formatting, lint, and type checks. Read-only by default;
  `--fix` applies formatting and lint fixes. Any failed stage, including lint
  warnings, produces a nonzero exit status. Patterns limit formatting and lint;
  type checking still covers the whole configured project.

- `vistta lint [patterns] [--fix]`
  Runs ESLint against the configured files or supplied patterns.
  `--fix` applies available fixes. Errors and warnings produce a nonzero exit
  status.

- `vistta fmt [patterns] [--check|--write]`
  Checks formatting with Prettier without changing files by
  default. `--check` makes that mode explicit; `--write` formats files in place.
  `--fix` is also accepted as a write alias. Check and write modes cannot be
  combined.

- `vistta types`
  Checks the complete TypeScript or JavaScript project using its configuration.
  Never emits files and does not accept file patterns.

- `vistta config [--sources]`
  Prints the merged project configuration, including built-in tool defaults.
  `--sources` also shows the selected config file and the origin of each setting.

- `vistta task <name> [-- args]`
  Runs a configured task, package script, or registered command with its task
  dependencies. Stops on the first failure and forwards arguments after `--`
  only to the requested task's executable command or script.

- `vistta run <name> [-- args]`
  Alias for `vistta task` in the base CLI. Frameworks can override it:
  `@vistta/js` uses `run` to launch applications, so use `vistta task` there.

- `vistta project name`
  Outputs the current project name from `package.json`.

- `vistta project version [increment|version] [prerelease-id]`
  Prints the current project version, increments it (for example, `patch` or
  `prerelease`), or sets an explicit version such as `1.2.3`.

- `vistta project outdated [dependency]`
  Shows installed (`Current`), range-compatible (`Wanted`), and `Latest`
  versions, plus the owning manifest and dependency type, using `npm outdated`,
  respecting npm registry settings and policies such as `min-release-age`.
  Inside a workspace package, only that package's dependencies are checked;
  running from the workspace root checks all workspace consumers.
  Linked workspace packages are excluded. Available compatible updates cause a
  nonzero exit status; newer versions outside the declared range are informational.

- `vistta project update [dependency] [--compatible] [--dry-run]`
  Updates declared dependency ranges to latest versions by default, which may
  include major upgrades. `--compatible` selects npm's wanted version within
  each dependency's existing range instead. `--dry-run` previews the exact
  manifest changes without writing files.

- `vistta project patch [dependency] [--dry-run]`
  Backward-compatible alias for `project update --compatible`. Despite the
  historical name, this can select a compatible minor update, not just patches.

Dependency updates only edit `package.json` ranges; run `npm install` afterward
to update installed versions and the lockfile. Workspace-root updates preserve
each consumer's own target version. If no ranges need changing, the command
says so explicitly. A dependency filter selects matching outdated entries; no
match means no outdated entry was found, not that the dependency exists.

```sh
vistta project --help
vistta project update --help
vistta project outdated react
vistta project update --compatible --dry-run
vistta project update react --compatible
vistta project update react --dry-run
```

- `vistta test [...patterns] [--filter=pattern] [--only]`
  Runs matching test files with the base CLI's Node runner. `--filter` selects
  test names using a case-insensitive regular expression; `--only` selects tests
  or suites marked as exclusive. Frameworks can provide a different test runner.

For browser-based test harnesses, import `TestRunner` from `@vistta/cli/test-runner` to avoid bundling Node-only CLI modules.

### Unified Project Configuration

Keep VISTTA settings in the `cli` block of `tsconfig.json` or `jsconfig.json`.
Comments and trailing commas are supported. If both files exist, `tsconfig.json`
takes precedence. The existing `cliOptions` block remains supported; `cli` wins
when both specify the same setting.

ESLint, Prettier, and TypeScript are included with the CLI; no separate tool
installation is required. To use project-specific versions, optionally install
them locally:

```sh
npm install --save-dev eslint prettier typescript
```

```jsonc
{
  "$schema": "./node_modules/@vistta/cli/config.schema.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
  },
  "include": ["src/**/*.js", "src/**/*.ts"],
  "exclude": ["dist"],
  "cli": {
    "check": { "format": true, "lint": true, "types": true },
    "format": {
      "engine": "prettier",
      "options": { "printWidth": 120, "semi": true },
    },
    "lint": {
      "engine": "eslint",
      "rules": { "no-unused-vars": "warn" },
    },
    "tasks": {
      "validate": { "dependsOn": ["check", "test"] },
      "release": { "dependsOn": ["validate"], "script": "publish:package" },
    },
  },
}
```

The optional `$schema` enables completion and validation for VISTTA settings.
The schema leaves other TypeScript and framework settings open; TypeScript
validates compiler options during `vistta types` or `vistta check`.

```sh
vistta check
vistta check --fix
vistta lint "src/**/*.js" --fix
vistta fmt --check
vistta fmt --write
vistta types
vistta config
vistta config --sources
vistta task validate
vistta run validate
```

- `check` runs formatting, linting, and type checking by default. Disable a stage
  with `cli.check`. All enabled stages run, and any failure produces a nonzero
  exit code. Lint warnings also fail the check.
- Checks are read-only unless `--fix` or `fmt --write` is supplied. Fix mode
  applies Prettier formatting and ESLint fixes; type checking never emits files.
- Tools are resolved from the current project first, falling back to the
  CLI-bundled versions when absent. Commands never download tools at runtime.
  Broken project installations report their errors instead of silently falling
  back. ESLint 9+ and Prettier 3 are supported. Plugins and custom parsers must
  still be installed in the project.
- `format.include` and `lint.include` override top-level `include`. Explicit
  command-line patterns override both and are relative to the working directory.
  The corresponding `exclude` settings, `compilerOptions.outDir`, dependencies,
  and Git metadata are excluded. Inherited patterns are relative to their owning
  configuration file. Type checking always covers the whole configured project.
- Existing ESLint and Prettier configs are used when present. Inline settings
  override them. Without an ESLint config, inline rules/options provide the flat
  config. `lint.options` contains flat-config properties, not ESLint constructor
  options. Without explicit includes, lint scans JS/TS and formatting scans files
  supported by Prettier. An empty match set passes without changing files.
- For plugins, parsers, or other executable settings, set `lint.config` or
  `format.config` to a module path such as `"./tools/eslint.js"`. It must default
  export the relevant tool configuration. Relative paths resolve from the owning
  config file; package references resolve from that same directory. Referenced
  lint configs replace ESLint config discovery; inline settings still win.

### Presets And Tasks

`extends` accepts a relative JSON/JSONC config, a package config export, or an
array of either. Parents apply left to right, then local settings override them.
Objects merge recursively; arrays and scalar values replace inherited values.
Circular presets, malformed JSONC, and invalid VISTTA tool/task settings fail
explicitly. `vistta config --sources` shows the merged configuration and the
file responsible for each leaf setting, including built-in check defaults.

Workspace packages can extend a shared root/preset config and override `cli`
locally. Commands run in the current package directory; they do not automatically
fan out across workspaces. Existing `compilerOptions`, `bundlerOptions`, and
custom commands continue to work.

Tasks run their `dependsOn` dependencies once, in order, before their optional
package `script`. Dependencies can name other tasks, current-package scripts, or
registered commands such as `check`, `lint`, `fmt`, `types`, `test`, and `bundle`
(or `build` when provided by a framework).
Missing tasks/scripts and dependency cycles fail before execution. The first
failed command stops the plan and propagates its exit status. Arguments after
`--` are forwarded only to the requested task's command or script:

```sh
vistta task release -- --dry-run
```

`vistta run` is a task alias in the base CLI. Framework command overrides are
preserved: `@vistta/js` keeps its application-oriented `run`, so use `vistta task`
there. Task caching and automatic cross-workspace scheduling are not implemented.

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

Licensed under the GNU General Public License version 3 only (`GPL-3.0-only`). See [LICENSE](LICENSE) for the full terms.

## **Contributing**

Thank you for your interest in contributing to this project! Please ensure that any contributions respect the licensing terms specified. If you encounter any issues or have suggestions, feel free to report them. All issues will be well received and addressed to thQe best of our ability. We appreciate your support and contributions!

### **Authors**

- [Tiago Terenas Almeida](https://github.com/tiagomta)
