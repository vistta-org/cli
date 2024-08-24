import fs from "@vistta/fs";
import { satisfies } from "semver";

export async function readJSONFile(path) {
  try {
    return JSON.parse(await fs.readFile(path));
  } catch {
    return {};
  }
}

export async function writeJSONFile(path, json) {
  try {
    return await fs.writeFile(path, JSON.stringify(json, null, 2));
  } catch {
    return {};
  }
}

export async function outdated() {
  if (!fs.existsSync("package.json")) throw new Error("No Package found.");
  const packages = await getProjectPackages();
  const data = {};
  const promises = [];
  const loadData = (packagePath, dependencies = {}, dev) => {
    const keys = Object.keys(dependencies);
    for (let i = 0, len = keys.length; i < len; i++) {
      const module = keys[i];
      const { version, resolved, link } = packages["node_modules/" + module] || {};
      if (link) continue;
      if (!version || !resolved) throw new Error(`Module ${module} not found `);
      promises.push(new Promise((resolve, reject) =>
        fetch(resolved.split("/-/")[0] + "/latest")
          .then((response) => response.json())
          .then(resolve)
          .catch(reject),
      ));
      data[module] = { package: packagePath, current: version, wanted: dependencies[module], dev };
    }
  }
  const rootPackage = await readJSONFile("package.json");
  loadData("package.json", rootPackage?.dependencies);
  loadData("package.json", rootPackage?.devDependencies, true);
  if (rootPackage.workspaces) {
    const entries = fs.glob(rootPackage.workspaces + "/package.json");
    let entry = (await entries.next())?.value;
    while (entry) {
      const workspacePackage = await readJSONFile(entry);
      loadData(entry, workspacePackage?.dependencies);
      loadData(entry, workspacePackage?.devDependencies, true);
      entry = (await entries.next())?.value;
    }
  }

  const result = [];
  const values = await Promise.all(promises);
  for (let i = 0, len = values.length; i < len; i++) {
    const module = data[values[i]?.name];
    module.name = values[i]?.name;
    module.latest = values[i]?.version;
    if (!module || !module?.latest || !module?.current || !module?.wanted) throw new Error(`Internal Error`);
    if (module.current === module.latest) continue;
    module.wanted = satisfies(module.latest, module.wanted) ? module.latest : module.current;
    result.push(module);
  }
  return result;
}

export async function getProjectRootFolderAndPackage(path = process.cwd()) {
  if (fs.existsSync(path + "/package.json"))
    return [path, (await readJSONFile(path + "/package.json"))];
  let newPath = fs.resolve(path, "..");
  if (newPath === path) throw new Error("No Package found.");
  return await getProjectRootFolderAndPackage(newPath);
}

export async function getProjectPackages(path = process.cwd()) {
  if (fs.existsSync(path + "/node_modules/.package-lock.json"))
    return (await readJSONFile(path + "/node_modules/.package-lock.json"))?.packages || {};
  let newPath = fs.resolve(path, "..");
  if (newPath === path) throw new Error("No Package Lock found.");
  return await getProjectPackages(newPath);
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
