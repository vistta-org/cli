import fs from "@vistta/fs";
import Console from "@vistta/console";
import { CLI } from "../index.js";

const dirname = import.meta.dirname;

export default class extends CLI {
  constructor(options) {
    super(options);
    this.register(fs.resolve(dirname, "../loaders/file.js"), "File", "*");
    this.register(fs.resolve(dirname, "../loaders/typescript.js"), "Typescript", "*", ["ts", "mts", "cts"], true);
    this.register(fs.resolve(dirname, "../loaders/json.js"), "JSON", "*", "json");
    this.register(fs.resolve(dirname, "../loaders/bundler.js"), "Bundler", "bundler");
    this.define("system", new Console({ date: false, index: -1 }));
    this.define("console", new Console());
  }

  async help() {
    const moduleCLIs = await (await import("../utils.js")).availableCLIs();
    system.log("vistta <command/script>\n\nAvailable commands:");
    system.log("\tbundle, package, install, add, uninstall,");
    system.log("\tremove, run, update, patch, outdated, test");
    const modules = Object.keys(moduleCLIs);
    for (let i = 0, len = modules.length; i < len; i++) {
      const module = modules[i];
      const list = [];
      for (let i2 = 0, len2 = moduleCLIs[module].length; i2 < len2; i2++) {
        if (moduleCLIs[module][i2] === "default") continue;
        list.push(moduleCLIs[module][i2]);
      }
      system.log(`From ${module}:\n\t${list.join(", ")}`);
    }
  }

  async main(file) {
    system.announce(`Vistta CLI v${process.env.CLI_VERSION}`);
    if (process.env.NODE_ENV === "development") await this.outdated();
    const filepath = fs.resolve(process.cwd(), file);
    if (!fs.existsSync(filepath)) {
      system.log(`Unknown command/script "${file}"\n`);
      return this.help();
    }
    import(filepath);
  }

  async outdated() {
    const modules = await (await import("../utils"))?.getOutdatedPackages(process.cwd());
    for (let i = 0, len = modules.length; i < len; i++) {
      const { name, current, wanted, latest } = modules[i];
      if (current === wanted)
        system.info(`Module "${name}" has a new version (${latest})`);
      else system.warn(`Module "${name}" is outdated (${latest})`);
    }
  }
}