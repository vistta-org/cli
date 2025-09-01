import fs from "@vistta/fs";
import { assign, async, extract, remove } from "@vistta/utils";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inc, satisfies, valid } from "semver";

export const ENABLED_NODE_OPTIONS = {
  "-w": "NODE_WATCH",
  "--watch": "NODE_WATCH",
  "--node-memory-debug": true,
  "--tls-cipher-list": true,
  "--prof": true,
  "--prof-process": true,
  "--enable-source-maps": true,
  "--trace-deprecation": true,
  "--max-old-space-size": true,
  "--inspect": true,
  "--inspect-brk": true,
};

export async function importJSON(filepath) {
  try {
    return JSON.parse(await fs.readFile(filepath));
  } catch {
    return {};
  }
}

export async function importEnv(filepath) {
  try {
    const env = {};
    const entries = (await fs.readFile(filepath, "utf8")).split("\n");
    for (let i = 0, len = entries.length; i < len; i++) {
      const [key, value] = entries[i].split("=");
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

export async function importConfig(options = {}) {
  try {
    const helper = async (file) => {
      file = fileURLToPath(import.meta.resolve(file));
      const {
        extends: parent,
        cliOptions: cli = {},
        compilerOptions: compiler = {},
        bundlerOptions: bundler = {},
      } = await importJSON(file);
      if (cli.commands) {
        const commands = Object.keys(cli.commands);
        const dirname = fs.dirname(file);
        for (let i = 0, len = commands.length; i < len; i++)
          cli.commands[commands[i]] = fs.resolve(dirname, cli.commands[commands[i]]);
      }
      if (parent) return assign(await helper(parent), { cli, compiler, bundler });
      return { cli, compiler, bundler };
    };
    let file = fs.resolve(process.cwd(), "tsconfig.json");
    if (!fs.existsSync(file)) file = fs.resolve(process.cwd(), "jsconfig.json");
    if (!fs.existsSync(file)) throw new Error("No Config found.");
    return assign(options, await helper(file));
  } catch (e) {
    console.error(e);
    return options;
  }
}

export async function getOutdatedPackages(dirname) {
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
    if (!(workspaces?.length > 0)) return;
    const workspaceDirnames = await resolveWorkspacesDirnames(workspaces);
    for (let i = 0, len = workspaceDirnames.length; i < len; i++)
      await processPackage(fs.resolve(workspaceDirnames[i], "package.json"), true);
  }
  async function fetchPackageUpdates(path, deps = {}, dev) {
    const keys = Object.keys(deps);
    for (let i = 0, len = keys.length; i < len; i++) {
      const packageName = keys[i];
      const { version, resolved, link } = packages["node_modules/" + packageName] || {};
      if (link) continue;
      if (!version) throw new Error(`Module ${packageName} not found `);
      promises.push(
        new Promise((resolve, reject) =>
          fetch(resolved ? resolved.split("/-/")[0] + "/latest" : `https://registry.npmjs.org/${packageName}/latest`)
            .then((response) => response.json())
            .then(resolve)
            .catch(reject),
        ),
      );
      data[packageName] = {
        package: path,
        current: version,
        wanted: deps[packageName],
        dev,
      };
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

export async function incrementPackageVersion(filepath, value) {
  const packageJSON = await importJSON(filepath);
  if (["major", "minor", "patch", "premajor", "preminor", "prepatch", "prerelease"].includes(value))
    packageJSON.version = inc(packageJSON.version, value);
  else if (valid(value)) packageJSON.version = value;
  else throw new TypeError("Invalid version or increment type.");
  await fs.writeFile(filepath, JSON.stringify(packageJSON, null, 2));
  return packageJSON.version;
}

export function saveCrashReport() {
  if (!process.env.NODE_CRASH_REPORT) return;
  const crashFolder = fs.resolve(process.cwd(), ".logs");
  if (!fs.existsSync(crashFolder)) fs.mkdir(crashFolder);
  const logs = console.logs;
  let output = "";
  for (let i = 0, len = logs.length; i < len; i++) {
    output += logs[i].time.toISOString() + " - " + logs[i].toString().replace(/\n/gm, " ") + "\n";
  }
  fs.writeFileSync(fs.resolve(crashFolder, Date.now() + ".log"), output);
}

export function run(script, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["--no-warnings", "--run", script, "--", ...args], {
      stdio: "inherit",
      shell: true,
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code));
    process.on("SIGINT", () => !child.killed && child.kill("SIGINT"));
    process.on("SIGTERM", () => !child.killed && child.kill("SIGTERM"));
  });
}

/**
 * Function to parse command line arguments.
 * @param {string[]} args
 * @returns
 */
export function parseArgs(args) {
  const result = [[], {}];
  for (let i = 0, len = args.length; i < len; i++) {
    const [option, value] = args[i].toLowerCase().split("=");
    if (option.startsWith("--")) result[1][option.slice(2)] = evaluate(value);
    else result[0].push(args[i]);
  }
  return result;
}

export { assign, async, extract, fs, remove };

async function getProjectLock(path) {
  if (fs.existsSync(path + "/package-lock.json")) return await importJSON(fs.resolve(path, "package-lock.json"));
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

function evaluate(value) {
  if (value == null || value === "true") return true;
  if (value === "false") return false;
  return value;
}
