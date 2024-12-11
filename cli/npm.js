import { exec } from "node:child_process";
import fs from "@vistta/fs";
import { CLI } from "../index.js";
import { importJSON, getOutdatedPackages } from "../utils.js";
import { COLORS } from "@vistta/console";

const COMMAND_MAPPING = {
  "install": "npm",
  "add": "npm",
  "uninstall": "npm",
  "remove": "npm",
  "update": "modules",
  "patch": "modules",
  "outdated": "modules",
}

export default class extends CLI {
  constructor(options) {
    super(options);
  }

  help(command) {
    switch (command) {
      case "install":
      case "add":
        console.print("Installs a package and any packages that it depends on.");
        console.print("\nUsage:");
        console.print("vistta install/add [package] [--prod]");
        break;
      case "uninstall":
      case "remove":
        console.print("Uninstalls a package, removing it from the package.json file.");
        console.print("\nUsage:");
        console.print("vistta uninstall/remove <package>");
        break;
      case "update":
        console.print("Updates the version of outdated modules to the latest version.");
        console.print("\nUsage:");
        console.print("vistta update [module]");
        break;
      case "patch":
        console.print("Updates the version of outdated modules to the latest patch version.");
        console.print("\nUsage:");
        console.print("vistta patch [module]");
        break;
      case "outdated":
        console.print("Lists all outdated modules in the current project.");
        console.print("\nUsage:");
        console.print("vistta outdated");
        break;
      default:
        break;
    }
  }

  async main(command, ...args) {
    await this[COMMAND_MAPPING[command]](command, ...args);
  }

  async npm(command, ...args) {
    if((command === "uninstall" || command === "remove") && args.length === 0) return this.help(command);
    const { added = 0, removed = 0, changed = 0, audit: { vulnerabilities = {} } } = (await npm(command, ...args)) || {};
    const summary = [];
    if(added) summary.push(`${added} Package${added > 1 ? "s" : ""} added.`);
    if(removed) summary.push(`${removed} Package${removed > 1 ? "s" : ""} removed.`);
    if(changed) summary.push(`${changed} Package${changed > 1 ? "s" : ""} changed.`);
    if(summary.length == 0) return console.print(`\nEverything is up to date.`);
    console.print(`\n${summary.join(" ")}`);
    if(vulnerabilities?.total > 0) {
      const keys = Object.keys(vulnerabilities);
      let vulnerabilitiesSummary = [];
      for(let i = 0, len = keys.length; i < len; i++) {
        const key = keys[i];
        if(key === "total") continue;
        const { severity, count } = vulnerabilities[key];
        if(count) vulnerabilitiesSummary.push(`${count} ${severity}`);
      }
      console.print(`Found ${vulnerabilities.total} vulnerabilities (${vulnerabilitiesSummary.join(", ")})`);
    }
    else console.print(`No vulnerabilities found.`);
  }

  async modules(command, arg1) {
    const modules = await getOutdatedPackages(process.cwd());
    let valid = true;
    let update = 0;
    for (let i = 0, len = modules.length; i < len; i++) {
      const { name, package: packagePath, current, wanted, latest, dev } = modules[i];
      if (command === "patch" || command === "update") {
        if (command === "patch" && current === wanted) continue;
        if (arg1 && name !== arg1) continue;
        const packageObj = await importJSON(packagePath);
        packageObj[dev ? "devDependencies" : "dependencies"][name] = "^" + (command === "patch" ? wanted : latest);
        await fs.writeFile(packagePath, JSON.stringify(packageObj, null, 2));
        update++;
      }
      else if (current === wanted) console.print(`${COLORS.CYAN}Module "${name}" has a new version (${latest})${COLORS.RESET}`);
      else console.print(`${COLORS.YELLOW}Module "${name}" is outdated (${latest})${COLORS.RESET}`), (valid = false);
    }

    if (modules.length == 0) console.print("Everything is up to date");
    else if (update > 0) await this.npm("install");
    process.exit(valid ? 0 : -1);
  }
}

function npm(...args) {
  let node_env = "development";
  const command = args.reduce((acc, arg) => {
    if(arg === "--prod" || arg === "--production"){
      node_env = "production";
      return acc;
    }
    return acc + " " + arg;
  }, "npm");
  return new Promise((resolve, reject) => exec(`${command} --json`, { env: { ...process.env, NODE_ENV: node_env }, windowsHide: true, shell: true }, (error, stdout) => {
    if (error) return reject(error);
    try {
      resolve(JSON.parse(stdout));
    } catch {
      resolve();
    }
  }));
}