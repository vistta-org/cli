import { fs } from "@vistta/fs";
import { satisfies } from "semver";

export async function parseJsonFile(path) {
  try {
    return JSON.parse(await fs.readFile(path));
  } catch {
    return {};
  }
}

export async function outdated() {
  if (!fs.existsSync("package.json")) throw new Error("No Package found.");
  const dependencies = await loadDependencies();
  const { packages } = await loadModuleData();
  const keys = Object.keys(dependencies);
  const promises = [];
  const currentVersions = {};
  for (let i = 0, len = keys.length; i < len; i++) {
    const module = keys[i];
    const { version, resolved, link } = packages["node_modules/" + module] || {};
    if (link) continue;
    if (!version || !resolved) throw new Error(`Module ${module} not found`);
    promises.push(fetchJson(resolved.split("/-/")[0] + "/latest"));
    currentVersions[module] = version;
  }

  const result = [];
  const values = await Promise.all(promises);
  for (let i = 0, len = values.length; i < len; i++) {
    const name = values[i]?.name;
    const latest = values[i]?.version;
    const wanted = dependencies[name];
    const current = currentVersions[name];
    if (!name || !latest || !current || !wanted) exit(`Internal Error`);
    if (current === latest) continue;
    result.push({
      name,
      latest,
      wanted: satisfies(latest, wanted) ? latest : current,
      current,
    });
  }
  return result;
}

export function disableExperimentalWarnings() {
  const emit = process.emit;
  process.emit = (name, data) => {
    if (
      name === `warning` &&
      typeof data === `object` &&
      data.name === `ExperimentalWarning`
    ) {
      return false;
    }
    return emit.apply(process, arguments);
  };
}

export async function exposeTestFunctions() {
  const { describe, it, suite, test, after, afterEach, before, beforeEach } = await import("node:test");

  describe.after = after;
  suite.after = after;
  describe.afterEach = afterEach;
  suite.afterEach = afterEach;
  describe.before = before;
  suite.before = before;
  describe.beforeEach = beforeEach;
  suite.beforeEach = beforeEach;

  global.describe = describe;
  global.it = it;
  global.suite = suite;
  global.test = test;
  global.assert = await import("node:assert");
}

export function exit(error) {
  if (error) system.error(error);
  process.exit(error ? 1 : 0);
}

//

async function loadDependencies() {
  const dependencies = {};
  let packageObj = await parseJsonFile("package.json");
  Object.assign(dependencies, packageObj?.dependencies, packageObj?.devDependencies);
  if (packageObj.workspaces) {
    const entries = fs.glob(packageObj.workspaces + "/package.json");
    let entry = (await entries.next())?.value;
    while (entry) {
      packageObj = await parseJsonFile(entry);
      Object.assign(dependencies, packageObj?.dependencies, packageObj?.devDependencies);
      entry = (await entries.next())?.value;
    }
  }
  return dependencies;
}

async function loadModuleData(path = process.cwd(), previous) {
  if (previous === path) return null;
  if (!fs.existsSync(path + "/node_modules/.package-lock.json"))
    return loadModuleData(fs.resolve(path, ".."), path);
  return parseJsonFile(path + "/node_modules/.package-lock.json");
}

function fetchJson(url) {
  return new Promise((resolve, reject) =>
    fetch(url)
      .then((response) => response.json())
      .then(resolve)
      .catch(reject),
  );
}
