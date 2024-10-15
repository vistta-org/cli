import { exec } from "node:child_process";
import { Console } from "@vistta/console";
import fs from "@vistta/fs";
import { CLI } from "../index.js";
import { importJSON, getOutdatedPackages } from "../utils.js";

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
    this.define("system", new Console({ date: false, index: -1 }));
    this.define("console", new Console());
  }

  help(command) {
    switch (command) {
      case "install":
      case "add":
        system.log("Installs a package and any packages that it depends on.");
        system.log("\nUsage:");
        system.log("vistta install/add [package] [--prod]");
        break;
      case "uninstall":
      case "remove":
        system.log("Uninstalls a package, removing it from the package.json file.");
        system.log("\nUsage:");
        system.log("vistta uninstall/remove <package>");
        break;
      case "update":
        system.log("Updates the version of outdated modules to the latest version.");
        system.log("\nUsage:");
        system.log("vistta update [module]");
        break;
      case "patch":
        system.log("Updates the version of outdated modules to the latest patch version.");
        system.log("\nUsage:");
        system.log("vistta patch [module]");
        break;
      case "outdated":
        system.log("Lists all outdated modules in the current project.");
        system.log("\nUsage:");
        system.log("vistta outdated");
        break;
      default:
        break;
    }
  }

  async main(command, ...args) {
    system.announce(`Vistta CLI v${process.env.CLI_VERSION}`);
    await this[COMMAND_MAPPING[command]](command, ...args);
  }

  async npm(command, ...args) {
    if((command === "uninstall" || command === "remove") && args.length === 0) return this.help(command);
    const { added = 0, removed = 0, changed = 0, audit: { vulnerabilities = {} } } = (await npm(command, ...args)) || {};
    const summary = [];
    if(added) summary.push(`${added} Package${added > 1 ? "s" : ""} added.`);
    if(removed) summary.push(`${removed} Package${removed > 1 ? "s" : ""} removed.`);
    if(changed) summary.push(`${changed} Package${changed > 1 ? "s" : ""} changed.`);
    if(summary.length == 0) return system.log(`\nEverything is up to date.`);
    system.log(`\n${summary.join(" ")}`);
    if(vulnerabilities?.total > 0) {
      const keys = Object.keys(vulnerabilities);
      let vulnerabilitiesSummary = [];
      for(let i = 0, len = keys.length; i < len; i++) {
        const key = keys[i];
        if(key === "total") continue;
        const { severity, count } = vulnerabilities[key];
        if(count) vulnerabilitiesSummary.push(`${count} ${severity}`);
      }
      system.log(`Found ${vulnerabilities.total} vulnerabilities (${vulnerabilitiesSummary.join(", ")})`);
    }
    else system.log(`No vulnerabilities found.`);
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
      else if (current === wanted) system.info(`Module "${name}" has a new version (${latest})`);
      else system.warn(`Module "${name}" is outdated (${latest})`), (valid = false);
    }

    if (modules.length == 0) system.log("Everything is up to date");
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