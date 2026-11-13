import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadProjectConfig } from "../config.js";
import { planTasks, projectTool, runChecks, runTasks, toolFiles } from "../tools.js";

function fixture(files) {
  const cwd = mkdtempSync(join(tmpdir(), "vistta-config-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), typeof content === "string" ? content : JSON.stringify(content));
  }
  return cwd;
}

suite("CLI configuration", async () => {
  await test("loads JSONC, relative presets, legacy settings, arrays, and setting sources", () => {
    const cwd = fixture({
      "presets/base.json": {
        compilerOptions: { checkJs: true },
        include: ["src/**/*.js"],
        cliOptions: { check: { format: false, lint: true }, commands: { custom: "./custom.js" } },
        cli: { format: { options: { semi: false } } },
      },
      "presets/custom.js": "export default class {}",
      "tsconfig.json":
        '{ // comment\n "extends": "./presets/base", "include": ["app/*.js"], "cli": { "check": { "types": false }, "format": { "options": { "singleQuote": true } } }, }',
    });
    try {
      const result = loadProjectConfig(cwd);
      assert.deepEqual(result.config.cli.check, { format: false, lint: true, types: false });
      assert.deepEqual(result.config.include, ["app/*.js"]);
      assert.deepEqual(result.config.cli.format.options, { semi: false, singleQuote: true });
      assert.equal(fileURLToPath(result.config.cli.commands.custom), join(cwd, "presets/custom.js"));
      assert.equal(result.sources["cli.format.options.semi"], join(cwd, "presets/base.json"));
      assert.equal(result.sources["cli.format.options.singleQuote"], join(cwd, "tsconfig.json"));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("supports package presets, jsconfig, and multiple ordered parents", () => {
    const cwd = fixture({
      "node_modules/preset/package.json": { name: "preset", exports: { "./config": "./config.json" } },
      "node_modules/preset/config.json": { cli: { format: { options: { semi: true, singleQuote: false } } } },
      "second.json": { cli: { format: { options: { semi: false } } } },
      "jsconfig.json": { extends: ["preset/config", "./second.json"] },
    });
    try {
      assert.deepEqual(loadProjectConfig(cwd).config.cli.format.options, { semi: false, singleQuote: false });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("rejects malformed, circular, and invalid configuration", () => {
    const cwd = fixture({ "tsconfig.json": "{broken}" });
    try {
      assert.throws(() => loadProjectConfig(cwd), /Invalid configuration/);
      writeFileSync(join(cwd, "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.json" }));
      assert.throws(() => loadProjectConfig(cwd), /Circular/);
      for (const cli of [
        { check: { types: "yes" } },
        { lint: { engine: "unknown" } },
        { format: { include: "*.js" } },
        { tasks: { build: { dependsOn: "test" } } },
      ]) {
        writeFileSync(join(cwd, "tsconfig.json"), JSON.stringify({ cli }));
        assert.throws(() => loadProjectConfig(cwd));
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("resolves inherited file patterns relative to their config and excludes dependencies", () => {
    const cwd = fixture({
      "preset/base.json": { include: ["src/**/*.js"], exclude: ["src/ignored/**"] },
      "tsconfig.json": { extends: "./preset/base.json" },
      "preset/src/main.js": "export {};",
      "preset/src/ignored/skip.js": "export {};",
      "preset/src/node_modules/skip/index.js": "export {};",
    });
    try {
      assert.deepEqual(toolFiles(loadProjectConfig(cwd), "lint", [], cwd), [join(cwd, "preset/src/main.js")]);
      assert.deepEqual(toolFiles(loadProjectConfig(cwd), "lint", ["preset/src/ignored/*.js"], cwd), []);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("orders dependencies once, rejects cycles and missing tasks, and stops on failure", async () => {
    const tasks = {
      validate: { dependsOn: ["lint", "test"], script: "finish" },
      test: { dependsOn: ["lint"], script: "unit" },
    };
    const plan = planTasks("validate", tasks, { unit: "node unit.js", finish: "node finish.js" });
    assert.deepEqual(
      plan.map((task) => task.name),
      ["lint", "test", "validate"],
    );
    assert.throws(() => planTasks("bad", { bad: { dependsOn: ["bad"] } }), /Circular/);
    assert.throws(() => planTasks("unknown"), /Unknown/);
    assert.throws(() => planTasks("build"), /Unknown/);
    assert.deepEqual(planTasks("build", {}, {}, ["build"]), [{ name: "build", command: "build" }]);
    assert.throws(() => planTasks("bad", { bad: { script: "missing" } }), /Unknown package script/);
    const calls = [];
    assert.equal(
      await runTasks(plan, process.cwd(), [], async (args) => {
        calls.push(args);
        return 2;
      }),
      2,
    );
    assert.equal(calls.length, 1);
    calls.length = 0;
    assert.equal(
      await runTasks(plan, process.cwd(), ["--flag"], async (args) => {
        calls.push(args);
        return 0;
      }),
      0,
    );
    assert.deepEqual(calls.at(-1), ["--run", "finish", "--", "--flag"]);
  });
});

suite("CLI tool adapters", async () => {
  await test("allows an optional final newline without hiding layout or extra blank-line differences", async () => {
    const cwd = fixture({
      "tsconfig.json": { include: ["src/*"] },
      "src/package.json": '{\n  "name": "fixture"\n}',
      "src/main.js": "export const value = 1;",
      "src/windows.js": "export const first = 1;\r\nexport const second = 2;",
      "src/terminated.js": "export const value = 1;\n",
    });
    try {
      const project = loadProjectConfig(cwd);
      assert.equal(await runChecks(["format"], project, { cwd }), 0);
      assert.equal(await runChecks(["format"], project, { cwd, fix: true }), 0);
      assert.equal(readFileSync(join(cwd, "src/main.js"), "utf8"), "export const value = 1;");
      assert.equal(readFileSync(join(cwd, "src/windows.js"), "utf8"), "export const first = 1;\r\nexport const second = 2;");
      assert.equal(readFileSync(join(cwd, "src/terminated.js"), "utf8"), "export const value = 1;\n");
      writeFileSync(join(cwd, "src/main.js"), "export const value=1");
      assert.equal(await runChecks(["format"], project, { cwd }), 1);
      assert.equal(await runChecks(["format"], project, { cwd, fix: true }), 0);
      assert.equal(readFileSync(join(cwd, "src/main.js"), "utf8"), "export const value = 1;");
      writeFileSync(join(cwd, "src/terminated.js"), "export const value = 1;\n\n");
      assert.equal(await runChecks(["format"], project, { cwd }), 1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("loads the console package's global API through the CLI declarations", async () => {
    const root = resolve(import.meta.dirname, "../../..");
    const globals = resolve(import.meta.dirname, "../global.d.ts").replaceAll("\\", "/");
    const cwd = fixture({
      "tsconfig.json": {
        files: ["main.js"],
        compilerOptions: {
          allowJs: true,
          checkJs: true,
          noEmit: true,
          skipLibCheck: true,
          strict: false,
          types: ["node"],
          typeRoots: [join(root, "node_modules/@types")],
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
        },
      },
      "main.js": `/// <reference path="${globals}" />\nconsole.print("ready");\nconsole.println();\nconsole.logs.map((log) => log.clone());\n`,
    });
    try {
      assert.equal(await runChecks(["types"], loadProjectConfig(cwd), { cwd }), 0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("recognizes JSX component references without hiding genuinely unused variables", async () => {
    const cwd = fixture({
      "tsconfig.json": { include: ["*.jsx"] },
      "main.jsx": [
        'import Button from "./button.js";',
        'import * as controls from "./controls.js";',
        'import * as UI from "./ui.js";',
        "const Local = () => <div />;",
        "export const view = <><Button /><Local /><UI.Menu.Item /><controls.Button /></>;",
        "",
      ].join("\n"),
    });
    try {
      const project = loadProjectConfig(cwd);
      assert.equal(await runChecks(["lint"], project, { cwd }), 0);
      writeFileSync(join(cwd, "main.jsx"), 'import Unused from "./unused.js";\nexport const view = <div />;\n');
      assert.equal(await runChecks(["lint"], project, { cwd }), 1);
      writeFileSync(join(cwd, "main.jsx"), "const div = 1;\nexport const view = <div />;\n");
      assert.equal(await runChecks(["lint"], project, { cwd }), 1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("runs lint and formatting from project JSON without external configuration files", async () => {
    const cwd = fixture({
      "package.json": { type: "module" },
      "tsconfig.json": {
        include: ["src/**/*.{js,jsx}"],
        cli: {
          lint: {
            env: { browser: true, node: true },
            languageOptions: { globals: { suite: "readonly" } },
          },
          format: { options: { printWidth: 125 } },
        },
      },
      "src/main.js": 'export const value = window.location.href + process.cwd();\r\nsuite("ready");\r\n',
      "src/main.jsx": 'export const view = <div id="ready" />;\r\n',
    });
    try {
      const project = loadProjectConfig(cwd);
      assert.equal(await runChecks(["format", "lint"], project, { cwd }), 0);
      assert.equal(readFileSync(join(cwd, "src/main.jsx"), "utf8"), 'export const view = <div id="ready" />;\r\n');
      writeFileSync(join(cwd, "src/main.js"), "export const value = missingName;\n");
      assert.equal(await runChecks(["lint"], project, { cwd }), 1);
      project.config.cli.format.options.endOfLine = "lf";
      assert.equal(await runChecks(["format"], project, { cwd }), 1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("loads an existing parser module specified in project JSON", async () => {
    const root = resolve(import.meta.dirname, "../../..");
    const cwd = fixture({
      "tsconfig.json": {
        include: ["*.jsx"],
        cli: {
          lint: {
            languageOptions: {
              parser: "@babel/eslint-parser",
              parserOptions: { requireConfigFile: false, babelOptions: { parserOpts: { plugins: ["jsx"] } } },
            },
          },
        },
      },
      "node_modules/@babel/eslint-parser/package.json": {
        main: createRequire(join(root, "package.json")).resolve("@babel/eslint-parser"),
      },
      "main.jsx": 'export const view = <div style:variant="basic" />;\n',
    });
    try {
      assert.equal(await runChecks(["lint"], loadProjectConfig(cwd), { cwd }), 0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("inherits missing settings and resolves inherited paths from their defining configs", async () => {
    const cwd = fixture({
      "tsconfig.json": {
        include: ["**/*.js"],
        compilerOptions: {
          allowJs: true,
          checkJs: true,
          types: ["fixture"],
          target: "ES2022",
          paths: { shared: ["./shared/value.js"] },
        },
        cli: { format: { options: { singleQuote: true, semi: false } } },
      },
      "node_modules/@types/fixture/index.d.ts": "declare const inheritedValue: number;\n",
      "shared/value.js": "export const shared = inheritedValue\n",
      "child/tsconfig.json": {
        include: ["src/**/*.js"],
        compilerOptions: { module: "ESNext", moduleResolution: "bundler" },
        cli: { format: { options: { semi: true } } },
      },
      "child/src/main.js": "import { shared } from 'shared';\nexport const child = shared + inheritedValue;\n",
      "child/src/deep/fallback.js": "export const parent = 'inherited';\n",
    });
    try {
      const project = loadProjectConfig(cwd);
      assert.equal(await runChecks(["format", "types"], project, { cwd }), 0);
      writeFileSync(join(cwd, "child/src/main.js"), "/** @type {string} */\nexport const child = inheritedValue;\n");
      assert.equal(await runChecks(["types"], project, { cwd }), 1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("uses nested formatting configs, includes, and exclusions without checking files twice", async () => {
    const cwd = fixture({
      "tsconfig.json": {
        include: ["src/**/*.js"],
        exclude: ["dist/**"],
        cli: { format: { options: { semi: true } } },
      },
      "src/main.js": "export const root = 1;\n",
      "src/deep/fallback.js": "export const parent = 1;\n",
      "dist/tsconfig.json": "{broken}",
      "child/tsconfig.json": {
        include: ["src/**/*.js"],
        exclude: ["src/ignored/**"],
        cli: { format: { options: { semi: false } } },
      },
      "child/src/main.js": "export const child = 1\n",
      "child/src/deep/fallback.js": "export const parent = 1\n",
      "child/src/ignored/main.js": "const ignored=1",
      "child/other.js": "const excluded=1",
    });
    try {
      const project = loadProjectConfig(cwd);
      assert.equal(await runChecks(["format"], project, { cwd }), 0);
      writeFileSync(join(cwd, "child/src/main.js"), "export const child=1;");
      assert.equal(await runChecks(["format"], project, { cwd, patterns: ["src/**/*.js"] }), 0);
      assert.equal(await runChecks(["format"], project, { cwd, patterns: ["child/src/**/*.js"] }), 1);
      assert.equal(await runChecks(["format"], project, { cwd, fix: true }), 0);
      assert.equal(readFileSync(join(cwd, "child/src/main.js"), "utf8"), "export const child = 1");
      assert.equal(readFileSync(join(cwd, "child/src/ignored/main.js"), "utf8"), "const ignored=1");
      assert.equal(readFileSync(join(cwd, "child/other.js"), "utf8"), "const excluded=1");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("checks nested projects with their own compiler options and parent fallback", async () => {
    const cwd = fixture({
      "tsconfig.json": {
        include: ["**/*.js"],
        exclude: ["**/dist/**", "**/appdata/**"],
        compilerOptions: { allowJs: true, checkJs: true, types: [], target: "ES2022" },
      },
      "main.js": "export const root = 1;\n",
      "child/jsconfig.json": {
        include: ["**/*.js"],
        exclude: ["src/ignored/**"],
        compilerOptions: { checkJs: false, types: [], target: "ES2022" },
      },
      "child/src/deep/main.js": "/** @type {string} */\nexport const child = 1;\n",
      "child/src/ignored/main.js": "invalid javascript !!!",
    });
    try {
      const project = loadProjectConfig(cwd);
      assert.equal(await runChecks(["types"], project, { cwd }), 0);
      mkdirSync(join(cwd, "src/deep"), { recursive: true });
      writeFileSync(join(cwd, "src/deep/fallback.js"), "/** @type {string} */\nexport const parent = 1;\n");
      assert.equal(await runChecks(["types"], project, { cwd }), 1);
      assert.equal(existsSync(join(cwd, "child/src/deep/main.d.ts")), false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("uses nested lint rules and exclusions", async () => {
    const cwd = fixture({
      "package.json": { type: "module" },
      "tsconfig.json": {
        include: ["**/*.js"],
        cli: { lint: { rules: { "no-unused-vars": "error" } } },
      },
      "main.js": "export const root = 1;\n",
      "child/tsconfig.json": {
        include: ["src/**/*.js"],
        exclude: ["src/ignored/**"],
        cli: { lint: { rules: { "no-unused-vars": "off" } } },
      },
      "child/src/deep/main.js": "const unused = 1;\n",
      "child/src/ignored/main.js": "invalid javascript !!!",
    });
    try {
      const project = loadProjectConfig(cwd);
      assert.equal(await runChecks(["lint"], project, { cwd }), 0);
      writeFileSync(join(cwd, "child/tsconfig.json"), JSON.stringify({ include: ["src/**/*.js"] }));
      writeFileSync(join(cwd, "child/src/ignored/main.js"), "export const valid = 1;\n");
      writeFileSync(join(cwd, "main.js"), "const unused = 1;\n");
      assert.equal(await runChecks(["lint"], project, { cwd }), 1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("does not use project configs or select inherited files above the working directory", async () => {
    const parent = fixture({
      "tsconfig.json": { cli: { format: { options: { semi: false } } } },
      "preset.json": { include: ["outside.js"], cli: { format: { options: { semi: true } } } },
      "outside.js": "const outside=1",
      "project/main.js": "export const value = 1;\n",
    });
    const cwd = join(parent, "project");
    try {
      assert.equal(loadProjectConfig(cwd).file, undefined);
      assert.equal(await runChecks(["format"], loadProjectConfig(cwd), { cwd }), 0);
      writeFileSync(join(cwd, "tsconfig.json"), JSON.stringify({ extends: "../preset.json" }));
      assert.equal(await runChecks(["format"], loadProjectConfig(cwd), { cwd, fix: true }), 0);
      assert.equal(await runChecks(["format"], loadProjectConfig(cwd), { cwd, patterns: ["../outside.js"], fix: true }), 0);
      assert.equal(readFileSync(join(parent, "outside.js"), "utf8"), "const outside=1");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  await test("uses bundled tools when the project does not install them", async () => {
    const cwd = fixture({
      "package.json": { name: "fixture", type: "module" },
      "tsconfig.json": {
        include: ["src/*.js"],
        compilerOptions: { allowJs: true, checkJs: true, noEmit: true, types: [], target: "ES2022" },
        cli: { lint: { rules: { "no-unused-vars": "error" } } },
      },
      "src/main.js": "export const value = 1;\n",
    });
    try {
      for (const name of ["eslint", "prettier", "typescript"]) {
        const bundled = await import(pathToFileURL(createRequire(import.meta.url).resolve(name)).href);
        assert.equal(await projectTool(name, cwd), bundled.default || bundled);
      }
      assert.equal(await runChecks(["format", "lint", "types"], loadProjectConfig(cwd), { cwd }), 0);
      const check = spawnSync(process.execPath, [fileURLToPath(new URL("../bin.js", import.meta.url)), "check"], {
        cwd,
        encoding: "utf8",
      });
      assert.equal(check.status, 0, check.stdout + check.stderr);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("checks JavaScript and TypeScript without a config and never emits files", async () => {
    const cwd = fixture({
      "package.json": { type: "module" },
      "src/main.js": 'import { value } from "./value";\nexport const result = new Map([["value", value]]);\n',
      "src/value.ts": "export const value: number = 1;\n",
      "src/module.mjs": "export const value = 1;\n",
      "src/common.cjs": "exports.value = 1;\n",
      "src/runtime.js":
        'import assert from "node:assert/strict";\nimport { basename } from "node:path";\nsuite("runtime", () => {\n  test("node and test globals", () => {\n    assert.equal(typeof process.execPath, "string");\n    expect(basename(import.meta.dirname)).toEqual("src");\n  });\n});\n',
      "node_modules/ignored/index.ts": "invalid typescript !!!",
      ".git/ignored.ts": "invalid typescript !!!",
      "dist/ignored.ts": "invalid typescript !!!",
      "build/ignored.ts": "invalid typescript !!!",
      "coverage/ignored.ts": "invalid typescript !!!",
    });
    try {
      const project = loadProjectConfig(cwd);
      assert.equal(await runChecks(["types"], project, { cwd }), 0);
      for (const file of ["src/value.js", "src/value.d.ts", "jsconfig.json", "tsconfig.json"])
        assert.equal(existsSync(join(cwd, file)), false);
      writeFileSync(join(cwd, "src/main.js"), "/** @type {string} */\nexport const value = 1;\n");
      assert.equal(await runChecks(["types"], project, { cwd }), 1);
      writeFileSync(join(cwd, "src/main.js"), "export const value = 1;\n");
      writeFileSync(join(cwd, "src/value.ts"), 'export const value: number = "wrong";\n');
      assert.equal(await runChecks(["types"], project, { cwd }), 1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("fails type checking without a config when there are no source files", async () => {
    const cwd = fixture({ "package.json": { type: "module" } });
    try {
      assert.equal(await runChecks(["types"], loadProjectConfig(cwd), { cwd }), 1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("runs check without a config and preserves nested compiler settings", async () => {
    const cwd = fixture({
      "package.json": { type: "module" },
      "main.js": "export const value = 1;\n",
      "child/jsconfig.json": {
        compilerOptions: { allowJs: true, checkJs: false, types: [] },
        cli: { check: { format: false, lint: false } },
      },
      "child/main.js": "/** @type {string} */\nexport const value = 1;\n",
    });
    const invoke = () =>
      spawnSync(process.execPath, [fileURLToPath(new URL("../bin.js", import.meta.url)), "check", "."], {
        cwd,
        encoding: "utf8",
      });
    try {
      const passed = invoke();
      assert.equal(passed.status, 0, passed.stdout + passed.stderr);
      writeFileSync(join(cwd, "main.js"), "/** @type {string} */\nexport const value = 1;\n");
      const failed = invoke();
      assert.equal(failed.status, 1, failed.stdout + failed.stderr);
      assert.match(failed.stdout + failed.stderr, /not assignable to type 'string'/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("prefers project tools and does not hide broken project installations", async () => {
    const cwd = fixture({
      "node_modules/prettier/package.json": { main: "index.cjs" },
      "node_modules/prettier/index.cjs": 'module.exports = { version: "project-prettier" };',
      "node_modules/eslint/package.json": { main: "index.cjs" },
      "node_modules/eslint/index.cjs": 'throw new Error("Broken project ESLint");',
      "node_modules/typescript/package.json": { exports: { "./internal": "./index.cjs" } },
      "broken/node_modules/prettier/package.json": { main: "missing.cjs" },
    });
    try {
      assert.equal((await projectTool("prettier", cwd)).version, "project-prettier");
      await assert.rejects(projectTool("eslint", cwd), /Broken project ESLint/);
      await assert.rejects(projectTool("typescript", cwd), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
      await assert.rejects(projectTool("prettier", join(cwd, "broken")), { code: "MODULE_NOT_FOUND" });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("formats and lints temporary files with project-local tools and checks types without emitting", async () => {
    const root = resolve(import.meta.dirname, "../../..");
    const cwd = fixture({
      "package.json": { name: "fixture", type: "module" },
      "tsconfig.json": {
        include: ["src/*.js"],
        compilerOptions: { allowJs: true, checkJs: true, noEmit: true, types: [], target: "ES2022" },
        cli: {
          lint: {
            engine: "eslint",
            config: "./eslint.config.mjs",
            rules: { "no-unused-vars": "error", semi: ["error", "always"] },
          },
          format: { engine: "prettier", config: "./prettier.config.mjs", options: { semi: true, singleQuote: false } },
        },
      },
      "src/main.js": "export const value=1",
      "eslint.config.mjs": 'export default [{ rules: { semi: ["error", "never"] } }];',
      "prettier.config.mjs": "export default { semi: false };",
      "node_modules/eslint/package.json": { main: join(root, "node_modules/eslint/lib/api.js") },
      "node_modules/prettier/package.json": { main: join(root, "node_modules/prettier/index.cjs") },
      "node_modules/typescript/package.json": { main: join(root, "node_modules/typescript/lib/typescript.js") },
    });
    try {
      const project = loadProjectConfig(cwd);
      assert.equal(await runChecks(["format"], project, { cwd }), 1);
      assert.equal(readFileSync(join(cwd, "src/main.js"), "utf8"), "export const value=1");
      assert.equal(await runChecks(["format"], project, { cwd, fix: true }), 0);
      assert.equal(readFileSync(join(cwd, "src/main.js"), "utf8"), "export const value = 1;");
      assert.equal(await runChecks(["lint", "types"], project, { cwd }), 0);
      writeFileSync(join(cwd, "src/main.js"), "const unused = 1;\nexport const value = 1;\nvalue();\n");
      assert.equal(await runChecks(["lint", "types"], project, { cwd }), 1);
      assert.equal(existsSync(join(cwd, "src/main.d.ts")), false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

suite("CLI public commands", async () => {
  await test("fails rather than passing when inherited inputs belong to another project", () => {
    const bin = fileURLToPath(new URL("../bin.js", import.meta.url));
    const cwd = fixture({
      "tsconfig.json": {
        include: ["preset/**/*.js"],
        compilerOptions: { allowJs: true, checkJs: true, types: [], target: "ES2022", skipLibCheck: false },
      },
      "preset/main.js": "export const preset = 1;\n",
      "child/tsconfig.json": { extends: "../tsconfig.json" },
      "child/main.js": "/** @type {string} */\nexport const child = 1;\n",
      "child/index.d.ts": "export const declaration: MissingType;\n",
    });
    const invoke = () => spawnSync(process.execPath, [bin, "types"], { cwd, encoding: "utf8" });
    try {
      const empty = invoke();
      assert.equal(empty.status, 1, empty.stdout + empty.stderr);
      assert.match(empty.stdout + empty.stderr, /No type-check inputs belong to/);
      assert.match(empty.stdout + empty.stderr, /Set include or files/);
      assert.doesNotMatch(empty.stdout + empty.stderr, /types \(child\): passed/);
      assert.match(empty.stdout + empty.stderr, /Checks: 1\/2 passed/);
      const standalone = spawnSync(process.execPath, [bin, "types"], { cwd: join(cwd, "child"), encoding: "utf8" });
      assert.equal(standalone.status, 1, standalone.stdout + standalone.stderr);
      assert.match(standalone.stdout + standalone.stderr, /No type-check inputs belong to/);
      writeFileSync(join(cwd, "child/tsconfig.json"), JSON.stringify({ include: ["./**/*.js", "./**/*.d.ts"] }));
      const checked = invoke();
      assert.equal(checked.status, 1, checked.stdout + checked.stderr);
      assert.match(checked.stdout + checked.stderr, /TS2322/);
      assert.match(checked.stdout + checked.stderr, /TS2304/);
      assert.doesNotMatch(checked.stdout + checked.stderr, /No type-check inputs belong to/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("reports workspace-only and empty solution configs as skipped rather than passed", () => {
    const bin = fileURLToPath(new URL("../bin.js", import.meta.url));
    const cwd = fixture({
      "tsconfig.json": {
        include: ["**/*.js"],
        compilerOptions: { allowJs: true, checkJs: true, types: [], target: "ES2022" },
      },
      "child/tsconfig.json": { include: ["./*.js"] },
      "child/main.js": "export const child = 1;\n",
    });
    const invoke = () => spawnSync(process.execPath, [bin, "types"], { cwd, encoding: "utf8" });
    try {
      const workspace = invoke();
      assert.equal(workspace.status, 0, workspace.stdout + workspace.stderr);
      assert.match(workspace.stdout + workspace.stderr, /types \(\.\): skipped \(no direct inputs\)/);
      assert.match(workspace.stdout + workspace.stderr, /types \(child\): passed/);
      assert.match(workspace.stdout + workspace.stderr, /Checks: 1\/1 passed \(1 skipped\)/);
      writeFileSync(
        join(cwd, "tsconfig.json"),
        JSON.stringify({
          files: [],
          references: [{ path: "./child" }],
          compilerOptions: { allowJs: true, checkJs: true, types: [], target: "ES2022" },
        }),
      );
      writeFileSync(join(cwd, "child/tsconfig.json"), JSON.stringify({ files: ["./main.js"], references: [] }));
      const solution = invoke();
      assert.equal(solution.status, 0, solution.stdout + solution.stderr);
      assert.match(solution.stdout + solution.stderr, /types \(\.\): skipped \(no direct inputs\)/);
      assert.match(solution.stdout + solution.stderr, /Checks: 1\/1 passed \(1 skipped\)/);
      writeFileSync(join(cwd, "tsconfig.json"), JSON.stringify({ files: [] }));
      const invalid = invoke();
      assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
      assert.match(invalid.stdout + invalid.stderr, /TS18002/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("does not discover or check an excluded playground project", () => {
    const bin = fileURLToPath(new URL("../bin.js", import.meta.url));
    const cwd = fixture({
      "tsconfig.json": {
        include: ["**/*.js"],
        exclude: ["**/playground/**"],
        compilerOptions: { allowJs: true, checkJs: true, types: [], target: "ES2022" },
        cli: { lint: { rules: { "no-unused-vars": "error" } } },
      },
      "main.js": "export const root = 1;\n",
      "playground/tsconfig.json": "{broken}",
      "playground/main.js": "invalid javascript !!!",
    });
    try {
      const checked = spawnSync(process.execPath, [bin, "check"], { cwd, encoding: "utf8" });
      assert.equal(checked.status, 0, checked.stdout + checked.stderr);
      assert.match(checked.stdout + checked.stderr, /Checks: 3\/3 passed/);
      assert.doesNotMatch(checked.stdout + checked.stderr, /playground/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("honors child exclusion overrides and warns instead of skipping re-included files", () => {
    const bin = fileURLToPath(new URL("../bin.js", import.meta.url));
    const cwd = fixture({
      "tsconfig.json": {
        include: ["**/*.js"],
        exclude: ["**/dist/**"],
        compilerOptions: { allowJs: true, checkJs: true, types: [], target: "ES2022" },
      },
      "main.js": "export const root = 1;\n",
      "child/tsconfig.json": { exclude: [] },
      "child/dist/bundle.js": "/** @type {string} */\nexport const generated=1;",
    });
    const invoke = (...args) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
    try {
      const formatted = invoke("fmt", "--write");
      assert.equal(formatted.status, 0, formatted.stdout + formatted.stderr);
      assert.match(formatted.stdout + formatted.stderr, /child configuration selects 1 file\(s\) excluded by/);
      assert.match(readFileSync(join(cwd, "child/dist/bundle.js"), "utf8"), /export const generated = 1;/);
      const checked = invoke("types");
      assert.equal(checked.status, 1, checked.stdout + checked.stderr);
      assert.match(checked.stdout + checked.stderr, /child configuration selects 1 file\(s\) excluded by/);
      assert.match(checked.stdout + checked.stderr, /TS2322/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("reports a failed type worker and continues checking remaining projects", () => {
    const bin = fileURLToPath(new URL("../bin.js", import.meta.url));
    const root = resolve(import.meta.dirname, "../../..");
    const cwd = fixture({
      "tsconfig.json": {
        include: ["**/*.js"],
        compilerOptions: { allowJs: true, checkJs: true, types: [], target: "ES2022" },
      },
      "node_modules/typescript/package.json": { main: "index.cjs" },
      "node_modules/typescript/index.cjs":
        'module.exports = { sys: {}, convertCompilerOptionsFromJson() { throw new Error("Broken TypeScript fixture"); } };',
      "child/tsconfig.json": {},
      "child/node_modules/typescript/package.json": { main: join(root, "node_modules/typescript/lib/typescript.js") },
      "child/main.js": "export const value = 1;\n",
    });
    try {
      const checked = spawnSync(process.execPath, [bin, "types"], { cwd, encoding: "utf8" });
      assert.equal(checked.status, 1, checked.stdout + checked.stderr);
      assert.match(checked.stdout + checked.stderr, /Broken TypeScript fixture/);
      assert.match(checked.stdout + checked.stderr, /types \(child\): passed/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("applies check flags per project while explicit commands still run", () => {
    const bin = fileURLToPath(new URL("../bin.js", import.meta.url));
    const cwd = fixture({
      "tsconfig.json": {
        include: ["**/*.js"],
        cli: { check: { format: false, lint: false, types: false } },
      },
      "main.js": "export const root=1",
      "child/tsconfig.json": {
        include: ["**/*.js"],
        cli: { check: { format: true, lint: false, types: false }, format: { options: { semi: false } } },
      },
      "child/main.js": "export const child=1;",
    });
    const invoke = (...args) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
    try {
      const check = invoke("check");
      assert.equal(check.status, 1, check.stdout + check.stderr);
      const fixed = invoke("check", "--fix");
      assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
      assert.equal(readFileSync(join(cwd, "main.js"), "utf8"), "export const root=1");
      assert.equal(readFileSync(join(cwd, "child/main.js"), "utf8"), "export const child = 1");
      assert.equal(invoke("fmt", "--write").status, 0);
      assert.equal(readFileSync(join(cwd, "main.js"), "utf8"), "export const root = 1;");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  await test("propagates check, fix, config, and task results through the executable", () => {
    const root = resolve(import.meta.dirname, "../../..");
    const bin = fileURLToPath(new URL("../bin.js", import.meta.url));
    const cwd = fixture({
      "package.json": {
        name: "fixture",
        scripts: { smoke: "node success.js", fail: "node failure.js", args: "node arguments.js" },
      },
      "tsconfig.json": {
        files: ["main.js"],
        cli: {
          check: { lint: false, types: false },
          format: { options: { semi: true } },
          tasks: { validate: { dependsOn: ["check"], script: "smoke" } },
        },
      },
      "main.js": "const value=1",
      "success.js": "process.exit(0);",
      "failure.js": "process.exit(7);",
      "arguments.js": 'if (process.argv[2] !== "--help") process.exit(3); console.log("FORWARDED");',
      "node_modules/prettier/package.json": { main: join(root, "node_modules/prettier/index.cjs") },
    });
    const invoke = (...args) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
    try {
      assert.equal(invoke("check").status, 1);
      const fixed = invoke("check", "--fix");
      assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
      assert.equal(readFileSync(join(cwd, "main.js"), "utf8"), "const value = 1;");
      const config = invoke("config", "--sources");
      assert.equal(config.status, 0, config.stdout + config.stderr);
      const effective = JSON.parse(config.stdout.slice(config.stdout.indexOf("{")));
      assert.equal(effective.config.cli.check.lint, false);
      assert.equal(effective.sources["cli.check.lint"], join(cwd, "tsconfig.json"));
      const task = invoke("task", "validate");
      assert.equal(task.status, 0, task.stdout + task.stderr);
      assert.equal(invoke("run", "smoke").status, 0);
      const forwarded = invoke("task", "args", "--", "--help");
      assert.equal(forwarded.status, 0, forwarded.stdout + forwarded.stderr);
      assert.match(forwarded.stdout, /FORWARDED/);
      assert.notEqual(invoke("task", "fail").status, 0);
      assert.notEqual(invoke("task", "missing").status, 0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
