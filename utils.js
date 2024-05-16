import { fs } from "@vistta/fs";
import { satisfies } from "semver";

export async function parsePackage(path) {
  try {
    return JSON.parse(await fs.readFile(path));
  } catch {
    return {};
  }
}

export async function outdated() {
  const packageLockPath = findPackageLock();
  if (!packageLockPath) exit(`No Modules found`);
  const packages = (await parsePackage(packageLockPath))?.packages;
  if (!packages) exit(`No Packages found`);
  const wantedVersions = {};
  const currentVersions = {};
  const promises = [];
  const resolve = (path, dependencies) => {
    const keys = Object.keys(dependencies);
    const base = "node_modules/";
    path = path + (path ? "/" : "") + "node_modules/";
    for (let i = 0, len = keys.length; i < len; i++) {
      const key = keys[i];
      const { version, resolved } =
        packages[path + key] || packages[base + key] || {};
      if (!version || currentVersions[key] || version === dependencies[key])
        continue;
      wantedVersions[key] = dependencies[key];
      currentVersions[key] = version;
      promises.push(fetchJson(resolved.split("/-/")[0] + "/latest"));
    }
  };

  const keys = Object.keys(packages);
  for (let i = 0, len = keys.length; i < len; i++) {
    const path = keys[i];
    if (path.match(/\bnode_modules\b/)) continue;
    resolve(path, packages[path]?.dependencies || {});
    resolve(path, packages[path]?.devDependencies || {});
  }

  const result = [];
  const values = await Promise.all(promises);
  for (let i = 0, len = values.length; i < len; i++) {
    const name = values[i]?.name;
    const latest = values[i]?.version;
    const wanted = wantedVersions[name];
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

export function exit(error) {
  if (error) system.error(error);
  process.exit(error ? 1 : 0);
}

//

function fetchJson(url) {
  return new Promise((resolve, reject) =>
    fetch(url)
      .then((response) => response.json())
      .then(resolve)
      .catch(reject),
  );
}

function findPackageLock(path = process.cwd()) {
  const parent = fs.resolve(path, "..");
  if (path === parent) return null;
  if (fs.existsSync(path + "/package-lock.json"))
    return path + "/package-lock.json";
  return findPackageLock(parent);
}
