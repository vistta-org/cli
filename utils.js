import fs from "@vistta/fs";
import { createRequire } from 'node:module';
import { pathToFileURL } from "node:url";
import { satisfies, inc } from "semver";

async function importJSON(filepath) {
  try {
    return JSON.parse(await fs.readFile(filepath));
  } catch {
    return {};
  }
}

async function importEnv(filepath) {
  try {
    const env = {};
    const entries = (await fs.readFile(filepath, 'utf8')).split('\n');
    for (let i = 0, len = entries.length; i < len; i++) {
      const [key, value] = entries[i].split("=");
      env[key] = value;
    }
    return env;
  }
  catch {
    return {};
  }
}

async function importCLI(command, system) {
  const require = createRequire(import.meta.url);
  const checked = {}
  let fallback;
  const processPackage = async (dirname, options) => {
    const path = fs.resolve(dirname, "package.json");
    if (checked[path]) return [null, options];
    else checked[path] = true;
    const { vistta, dependencies, workspaces } = (await importJSON(path)) || {};
    options = assign(vistta?.options || {}, options);
    if (vistta?.cli?.[command]) return [(await import(pathToFileURL(fs.resolve(dirname, vistta.cli[command]))))?.default, options];
    if (!fallback && vistta?.cli?.["default"]) fallback = fs.resolve(dirname, vistta.cli["default"]);
    if (workspaces) {
      const workspaceDirnames = await resolveWorkspacesDirnames(workspaces);
      for (let i = 0, len = workspaceDirnames.length; i < len; i++) {
        const result = await processPackage(workspaceDirnames[i], options);
        if (result[0]) return result;
      }
    }
    const keys = Object.keys(dependencies || {});
    for (let i = 0, len = keys.length; i < len; i++) {
      const result = await processPackage(fs.dirname(require.resolve(keys[i])), options);
      if (result[0]) return result;
    }
    return [null, options];
  }
  const [cli, options] = await processPackage(process.cwd());
  if (cli) return new cli(options);
  if (system[command]) return new ((await import(pathToFileURL(fs.resolve(fs.dirname(import.meta.url), system[command])))).default)(options);
  if (fallback) return new ((await import(pathToFileURL(fallback))).default)(options);
  return new system["default"](options);
}

async function availableCLIs() {
  const require = createRequire(import.meta.url);
  const checked = {}
  const commands = {}
  const processPackage = async (dirname) => {
    const path = fs.resolve(dirname, "package.json");
    if (checked[path]) return;
    else checked[path] = true;
    const { name, vistta, dependencies, workspaces } = (await importJSON(path)) || {};
    if (vistta?.cli) commands[name] = Object.keys(vistta.cli);
    if (workspaces) {
      const workspaceDirnames = await resolveWorkspacesDirnames(workspaces);
      for (let i = 0, len = workspaceDirnames.length; i < len; i++)
        await processPackage(workspaceDirnames[i]);
    }
    const keys = Object.keys(dependencies || {});
    for (let i = 0, len = keys.length; i < len; i++)
      await processPackage(fs.dirname(require.resolve(keys[i])));
  }
  await processPackage(process.cwd());
  return commands;
}

async function getOutdatedPackages(dirname) {
  const packages = (await getProjectLock(dirname))?.packages || {};
  const data = {};
  const promises = [];
  async function processPackage(filepath, workspace) {
    if (!fs.existsSync(filepath)) {
      if (workspace) return;
      else throw new Error("No Package found");
    }
    const { dependencies, devDependencies, workspaces } = await importJSON(filepath);
    await fetchPackageUpdates(filepath, dependencies);
    await fetchPackageUpdates(filepath, devDependencies, true);
    if (workspace || !(workspaces?.length > 0)) return;
    const workspaceDirnames = resolveWorkspacesDirnames(workspaces);
    for (let i = 0, len = workspaceDirnames.length; i < len; i++)
      processPackage(fs.resolve(workspaceDirnames[i], "package.json"), true);
  }
  async function fetchPackageUpdates(path, deps = {}, dev) {
    const keys = Object.keys(deps);
    for (let i = 0, len = keys.length; i < len; i++) {
      const packageName = keys[i];
      const { version, resolved, link } = packages["node_modules/" + packageName] || {};
      if (link) continue;
      if (!version || !resolved) throw new Error(`Module ${module} not found `);
      promises.push(new Promise((resolve, reject) =>
        fetch(resolved.split("/-/")[0] + "/latest")
          .then((response) => response.json())
          .then(resolve)
          .catch(reject),
      ));
      data[packageName] = { package: path, current: version, wanted: deps[packageName], dev };
    }
  }
  const result = [];
  await processPackage(fs.resolve(dirname, "package.json"));
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

async function incrementPackageVersion(filepath, type) {
  const packageJSON = await importJSON(filepath);
  if (!["major", "minor", "patch", "premajor", "preminor", "prepatch", "prerelease"].includes(type))
    throw new TypeError("Invalid version increment type.");
  packageJSON.version = inc(packageJSON.version, type);
  await fs.writeFile(filepath, JSON.stringify(packageJSON, null, 2));
  return packageJSON.version;
}

export { fs, importJSON, importEnv, importCLI, availableCLIs, getOutdatedPackages, incrementPackageVersion };

async function getProjectLock(path) {
  if (fs.existsSync(path + "/package-lock.json"))
    return await importJSON(fs.resolve(path, "package-lock.json"));
  const newPath = fs.resolve(path, "..");
  if (newPath === path) throw new Error("No Package Lock found.");
  return await getProjectLock(newPath);
}

async function resolveWorkspacesDirnames(workspaces) {
  const paths = [];
  for (let i = 0, len = workspaces.length; i < len; i++) {
    if (!workspaces[i].includes("*")) {
      paths.push(workspaces[i]);
      continue;
    }
    const entries = fs.glob(workspaces[i]);
    let entry = (await entries.next())?.value;
    while (entry) {
      paths.push(entry);
      entry = (await entries.next())?.value;
    }
  }
  return paths;
}

function assign(a, b) {
  if (b == null) return a;
  if (!isPlainObject(a) || !isPlainObject(b)) return b;

  const keys = Object.keys(b);
  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i];
    if (isPlainObject(b[key])) {
      if (!a[key]) a[key] = {};
      a[key] = assign(a[key], b[key]);
    } else {
      a[key] = b[key];
    }
  }
  return a;
}

function isPlainObject(obj) {
  return Object.prototype.toString.call(obj) === '[object Object]';
}