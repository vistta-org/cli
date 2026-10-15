import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "../classes/command.js";
import { getOutdatedPackages } from "../utils.js";

suite("CLI", () => {
  let cmd;
  test("register adds a loader", () => {
    cmd = new Command();
    cmd.register("/path/to/loader.js", { type: "custom", filter: ".*\\.custom" });
    expect(cmd.loaders.length).toEqual(1);
    expect(cmd.loaders[0].main).toEqual("/path/to/loader.js");
    expect(cmd.loaders[0].type).toEqual("custom");
    expect(cmd.loaders[0].filter).toEqual(".*\\.custom");
  });

  test("resolve adds new extensions", () => {
    cmd = new Command();
    cmd.resolve("ts", "json");
    expect(cmd.resolvers).toInclude("ts");
    expect(cmd.resolvers).toInclude("json");
  });

  test("main throws error if not implemented", () => {
    cmd = new Command();
    expect(() => cmd.main()).toThrow("Method 'main' must be implemented.");
  });

  test("help does not throw by default", () => {
    cmd = new Command();
    expect(() => cmd.help()).not.toThrow();
  });

  test("define sets global and env variables", () => {
    cmd = new Command();
    cmd.define("global", "FOO", 123);
    cmd.define("env", "BAR", "baz");
    expect(global["FOO"]).toEqual(123);
    expect(process.env["BAR"]).toEqual("baz");
  });
});

async function checkNpmReport(report, code, packages = {}, workspace = "") {
  const dirname = mkdtempSync(join(tmpdir(), "vistta-outdated-"));
  const npmPath = process.env.npm_execpath;
  try {
    writeFileSync(join(dirname, "package.json"), JSON.stringify({ name: "fixture", private: true }));
    writeFileSync(join(dirname, "package-lock.json"), JSON.stringify({ packages }));
    const script = join(dirname, "npm.cjs");
    writeFileSync(
      script,
      [
        "const assert = require('node:assert/strict');",
        "assert.deepEqual(process.argv.slice(2), ['outdated', '--json', '--long', '--include=dev']);",
        `process.stdout.write(${JSON.stringify(JSON.stringify(report))});`,
        `process.exit(${code});`,
      ].join("\n"),
    );
    process.env.npm_execpath = script;
    const cwd = join(dirname, workspace);
    if (workspace) {
      mkdirSync(cwd, { recursive: true });
      writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "workspace" }));
    }
    return { dirname, modules: await getOutdatedPackages(cwd) };
  } finally {
    if (npmPath === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = npmPath;
    rmSync(dirname, { recursive: true, force: true });
  }
}

suite("CLI outdated", async () => {
  await test("uses npm wanted versions and preserves separate workspace consumers", async () => {
    const { dirname, modules } = await checkNpmReport(
      {
        shared: [
          { current: "1.0.0", wanted: "1.5.0", latest: "2.0.0", type: "dependencies", dependedByLocation: "packages/first" },
          {
            current: "1.0.0",
            wanted: "1.0.0",
            latest: "2.0.0",
            type: "devDependencies",
            dependedByLocation: "packages/second",
          },
        ],
        linked: { current: "2.0.0", wanted: "1.0.0", latest: "1.0.0", type: "dependencies" },
        peer: { current: "1.0.0", wanted: "2.0.0", latest: "2.0.0", type: "peerDependencies" },
      },
      1,
      { "node_modules/linked": { link: true } },
    );
    assert.deepEqual(modules, [
      {
        name: "shared",
        package: join(dirname, "packages/first/package.json"),
        current: "1.0.0",
        wanted: "1.5.0",
        latest: "2.0.0",
        dev: false,
      },
      {
        name: "shared",
        package: join(dirname, "packages/second/package.json"),
        current: "1.0.0",
        wanted: "1.0.0",
        latest: "2.0.0",
        dev: true,
      },
    ]);
  });

  await test("accepts an empty npm report", async () => {
    const { modules } = await checkNpmReport({}, 0);
    assert.deepEqual(modules, []);
  });

  await test("resolves workspace owners relative to the lockfile when invoked inside a package", async () => {
    const { dirname, modules } = await checkNpmReport(
      {
        dependency: {
          current: "1.0.0",
          wanted: "1.1.0",
          latest: "1.1.0",
          type: "dependencies",
          dependedByLocation: "packages/child",
        },
      },
      1,
      {},
      "packages/child",
    );
    assert.equal(modules[0].package, join(dirname, "packages/child/package.json"));
  });

  await test("surfaces npm errors instead of reporting everything up to date", async () => {
    await assert.rejects(checkNpmReport({ error: { summary: "Registry unavailable" } }, 1), /Registry unavailable/);
  });

  await test("limits package checks to their own dependency consumers", async () => {
    const { dirname, modules } = await checkNpmReport(
      {
        root: { current: "1.0.0", wanted: "1.1.0", latest: "1.1.0", type: "dependencies" },
        shared: [
          {
            current: "1.0.0",
            wanted: "1.1.0",
            latest: "1.1.0",
            type: "devDependencies",
            dependedByLocation: "packages/child",
          },
          {
            current: "1.0.0",
            wanted: "1.2.0",
            latest: "1.2.0",
            type: "dependencies",
            dependedByLocation: "packages/sibling",
          },
        ],
      },
      1,
      {},
      "packages/child",
    );
    assert.deepEqual(modules, [
      {
        name: "shared",
        package: join(dirname, "packages/child/package.json"),
        current: "1.0.0",
        wanted: "1.1.0",
        latest: "1.1.0",
        dev: true,
      },
    ]);
  });
});
