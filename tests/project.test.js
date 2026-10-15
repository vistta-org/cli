import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function project(report = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "vistta-project-"));
  const files = {
    "package.json": { name: "fixture", version: "1.0.0", dependencies: { latest: "^1.0.0" } },
    "package-lock.json": { packages: {} },
    "packages/first/package.json": { name: "first", dependencies: { shared: "^1.0.0", untouched: "^1.0.0" } },
    "packages/second/package.json": { name: "second", devDependencies: { shared: "^2.0.0" } },
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), JSON.stringify(content));
  }
  const npm = join(cwd, "npm.cjs");
  writeFileSync(
    npm,
    `process.stdout.write(${JSON.stringify(JSON.stringify(report))}); process.exit(${Object.keys(report).length ? 1 : 0});`,
  );
  return {
    cwd,
    read: (path) => JSON.parse(readFileSync(join(cwd, path), "utf8")),
    invoke: (...args) =>
      spawnSync(process.execPath, [fileURLToPath(new URL("../bin.js", import.meta.url)), "project", ...args], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, npm_execpath: npm },
      }),
    clean: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

const report = {
  shared: [
    { current: "1.0.0", wanted: "1.5.0", latest: "3.0.0", type: "dependencies", dependedByLocation: "packages/first" },
    { current: "2.0.0", wanted: "2.8.0", latest: "3.0.0", type: "devDependencies", dependedByLocation: "packages/second" },
  ],
  latest: { current: "1.0.0", wanted: "1.0.0", latest: "2.0.0", type: "dependencies" },
};

suite("Project command", () => {
  test("shows consistent help and metadata and rejects unknown commands and arguments", () => {
    const fixture = project();
    try {
      assert.match(fixture.invoke().stdout, /Project metadata and dependency maintenance/);
      assert.match(fixture.invoke("update", "--help").stdout, /may include major upgrades/);
      assert.match(fixture.invoke("help", "patch").stdout, /not patch-only/);
      assert.match(fixture.invoke("name").stdout, /fixture/);
      assert.match(fixture.invoke("version").stdout, /1\.0\.0/);
      assert.equal(fixture.invoke("version", "patch").status, 0);
      assert.equal(fixture.read("package.json").version, "1.0.1");
      assert.notEqual(fixture.invoke("typo").status, 0);
      assert.notEqual(fixture.invoke("update", "--typo").status, 0);
      assert.notEqual(fixture.invoke("name", "extra").status, 0);
    } finally {
      fixture.clean();
    }
  });

  test("reports versions and manifests and preserves informational-only exit status", () => {
    const fixture = project(report);
    try {
      const result = fixture.invoke("outdated");
      assert.equal(result.status, 1);
      assert.match(result.stdout, /Current\s+Wanted\s+Latest/);
      assert.match(result.stdout, /1\.5\.0/);
      assert.match(result.stdout, /packages[\\/]second[\\/]package\.json/);
      assert.match(result.stdout, /2 compatible update/);
      const informational = fixture.invoke("outdated", "latest");
      assert.equal(informational.status, 0);
      assert.doesNotMatch(informational.stdout, /shared/);
      assert.match(fixture.invoke("outdated", "absent").stdout, /No outdated dependency/);
    } finally {
      fixture.clean();
    }
  });

  test("previews compatible changes and writes each workspace's own target version", () => {
    const fixture = project(report);
    try {
      const preview = fixture.invoke("update", "shared", "--compatible", "--dry-run");
      assert.equal(preview.status, 0, preview.stdout + preview.stderr);
      assert.match(preview.stdout, /Dry run: no files changed/);
      assert.equal(fixture.read("packages/first/package.json").dependencies.shared, "^1.0.0");
      assert.equal(fixture.read("packages/second/package.json").devDependencies.shared, "^2.0.0");
      const updated = fixture.invoke("patch", "shared");
      assert.equal(updated.status, 0, updated.stdout + updated.stderr);
      assert.equal(fixture.read("packages/first/package.json").dependencies.shared, "^1.5.0");
      assert.equal(fixture.read("packages/first/package.json").dependencies.untouched, "^1.0.0");
      assert.equal(fixture.read("packages/second/package.json").devDependencies.shared, "^2.8.0");
      assert.equal(fixture.read("package.json").dependencies.latest, "^1.0.0");
      assert.match(updated.stdout, /Run npm install/);
      assert.match(fixture.invoke("patch", "shared").stdout, /No compatible dependency range changes needed/);
    } finally {
      fixture.clean();
    }
  });

  test("keeps latest update behavior explicit and reports missing installed dependencies", () => {
    const fixture = project({ ...report, missing: { wanted: "1.0.0", latest: "1.0.0", type: "dependencies" } });
    try {
      assert.equal(fixture.invoke("outdated", "missing").status, 1);
      assert.match(fixture.invoke("outdated", "missing").stdout, /MISSING/);
      assert.equal(fixture.invoke("update", "shared").status, 0);
      assert.equal(fixture.read("packages/first/package.json").dependencies.shared, "^3.0.0");
      assert.equal(fixture.read("packages/second/package.json").devDependencies.shared, "^3.0.0");
    } finally {
      fixture.clean();
    }
  });
});
