import fs from "@vistta/fs";
import { assign, async, extract, remove } from "@vistta/utils";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { isAbsolute, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inc, valid } from "semver";

export const CWD = process.cwd();
export const FALLBACK = "*";
export const BUNDLER_SUFFIX = "?__bundler__";
export const BUNDLER_SUFFIX_RE = /\?__bundler__$/;
export const WITH_TYPE_RE = /[?&]__with_type=([^&#]*)/;
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
    return JSON.parse(String(await fs.readFile(filepath)));
  } catch {
    return {};
  }
}

export async function importEnv(filepath) {
  try {
    const env = {};
    const entries = String(await fs.readFile(filepath, "utf8")).split("\n");
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
          cli.commands[commands[i]] = resolve(dirname, cli.commands[commands[i]]);
      }
      if (parent) return assign(await helper(ensurePath(parent)), { cli, compiler, bundler });
      return { cli, compiler, bundler };
    };
    let file = fs.resolve(process.cwd(), "tsconfig.json");
    if (!fs.existsSync(file)) file = fs.resolve(process.cwd(), "jsconfig.json");
    if (!fs.existsSync(file)) return options;
    return assign(options, await helper(ensurePath(file)));
  } catch (e) {
    console.error(e.trace || e.message);
    return options;
  }
}

export async function getOutdatedPackages(dirname) {
  const lock = await getProjectLock(dirname);
  const packages = lock.packages || {};
  if (!fs.existsSync(fs.resolve(dirname, "package.json"))) throw new Error("No Package found");
  const output = await new Promise((resolve, reject) => {
    const npmPath = process.env.npm_execpath;
    const args = ["outdated", "--json", "--long", "--include=dev"];
    const windowsShell = !npmPath && platform() === "win32";
    const command = npmPath ? process.execPath : windowsShell ? process.env.ComSpec || "cmd.exe" : "npm";
    const child = spawn(
      command,
      npmPath ? [npmPath, ...args] : windowsShell ? ["/d", "/s", "/c", "npm " + args.join(" ")] : args,
      {
        cwd: dirname,
        windowsHide: true,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (value) => {
      stdout += value;
    });
    child.stderr.on("data", (value) => {
      stderr += value;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        const data = JSON.parse(stdout || "{}");
        if ((code !== 0 && code !== 1) || data.error)
          reject(new Error(data.error?.summary || stderr || `npm outdated exited with code ${code}`));
        else resolve(data);
      } catch (error) {
        reject(new Error(stderr || error.message));
      }
    });
  });
  const result = [];
  for (const [name, entries] of Object.entries(output)) {
    for (const entry of Array.isArray(entries) ? entries : [entries]) {
      const location = entry.location
        ? relative(lock.dirname, entry.location).replaceAll("\\", "/")
        : "node_modules/" + name;
      if (packages[location]?.link || packages["node_modules/" + name]?.link) continue;
      if (entry.type !== "dependencies" && entry.type !== "devDependencies") continue;
      result.push({
        name,
        package: fs.resolve(lock.dirname, entry.dependedByLocation || "", "package.json"),
        current: entry.current,
        wanted: entry.wanted,
        latest: entry.latest,
        dev: entry.type === "devDependencies",
      });
    }
  }
  return result;
}

export async function incrementPackageVersion(filepath, value, id) {
  const packageJSON = await importJSON(filepath);
  if (["major", "minor", "patch", "premajor", "preminor", "prepatch", "prerelease"].includes(value))
    packageJSON.version = inc(packageJSON.version, value, id);
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
  for (let i = 0, len = logs.length; i < len; i++)
    output += logs[i].time.toLocalISOString() + ": " + logs[i].toString({ time: false });
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

export function parseArgs(args) {
  const result = /** @type {[string[], Record<string, any>]} */ ([[], {}]);
  for (let i = 0, len = args.length; i < len; i++) {
    const lower = args[i].toLowerCase();
    const eq = lower.indexOf("=");
    const option = eq === -1 ? lower : lower.slice(0, eq);
    const value = eq === -1 ? undefined : args[i].slice(eq + 1);
    if (option.startsWith("--")) result[1][option.slice(2)] = evaluate(value);
    else result[0].push(args[i]);
  }
  return result;
}

export function resolve(...values) {
  if (platform() === "win32") return pathToFileURL(fs.resolve(...values)).toString();
  return fs.resolve(...values);
}

/**
 * Append the bundler marker to a URL/path so it occupies a distinct slot in
 * Node's ESM module cache from the same file imported without the marker.
 * @param {string} url
 * @returns {string}
 */
export function markBundler(url) {
  return BUNDLER_SUFFIX_RE.test(url) ? url : url + BUNDLER_SUFFIX;
}

/**
 * Remove the bundler marker from a URL/path if present.
 * @param {string | undefined | null} url
 * @returns {string}
 */
export function stripBundler(url) {
  return url ? url.replace(BUNDLER_SUFFIX_RE, "") : "";
}

/**
 * Build a stable, sorted query string encoding the import attributes so that
 * two imports of the same file with different `with: { ... }` attributes land
 * in distinct ESM module cache slots. Mirrors the bundler marker pattern.
 * @param {Record<string, any> | undefined | null} attrs
 * @returns {string}
 */
export function markAttributes(attrs) {
  if (!attrs) return "";
  const keys = Object.keys(attrs)
    .filter((k) => attrs[k] != null)
    .sort();
  if (keys.length === 0) return "";
  return keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(attrs[k]))}`).join("&");
}

export { assign, async, extract, remove };

async function getProjectLock(path) {
  if (fs.existsSync(path + "/package-lock.json"))
    return { ...(await importJSON(fs.resolve(path, "package-lock.json"))), dirname: path };
  const newPath = fs.resolve(path, "..");
  if (newPath === path) throw new Error("No Package Lock found.");
  return await getProjectLock(newPath);
}

function evaluate(value) {
  if (value == null || value === "true") return true;
  if (value === "false") return false;
  return value;
}

function ensurePath(value) {
  try {
    if (isAbsolute(value)) return value;
    value = import.meta.resolve(value);
    if (isAbsolute(value)) return value;
    return fileURLToPath(value);
  } catch {
    return value;
  }
}
