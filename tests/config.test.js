import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig } from "../config.js";
import { planTasks, runChecks, runTasks, toolFiles } from "../tools.js";

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
      assert.equal(readFileSync(join(cwd, "src/main.js"), "utf8"), "export const value = 1;\n");
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
      assert.equal(readFileSync(join(cwd, "main.js"), "utf8"), "const value = 1;\n");
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
