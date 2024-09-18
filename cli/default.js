import fs from "@vistta/fs";
import Console from "@vistta/console";
import { CLI } from "../index.js";

const dirname = fs.dirname(import.meta.url);

export default class extends CLI {
  constructor(options) {
    super(options);
    this.register(fs.resolve(dirname, "../loaders/file.js"), "*");
    this.register(fs.resolve(dirname, "../loaders/typescript.js"), "*", ["ts", "mts", "cts"], true);
    this.register(fs.resolve(dirname, "../loaders/json.js"), "*", "json");
    this.register(fs.resolve(dirname, "../loaders/bundler.js"), "bundler");
    this.define("system", new Console({ date: false, index: -1 }));
    this.define("console", new Console());
  }

  async help(message) {
    const moduleCLIs = await (await import("../utils.js")).availableCLIs();
    if (message) system.log(message)
    system.log("vistta <command/script>");
    system.log("\nAvailable commands:\n");
    system.log("vistta packages");
    system.log("vistta test");
    const modules = Object.keys(moduleCLIs);
    for (let i = 0, len = modules.length; i < len; i++) {
      const module = modules[i];
      for (let i2 = 0, len2 = moduleCLIs[module].length; i2 < len2; i2++) {
        if (moduleCLIs[module][i2] === "default") continue;
        system.log(`vistta ${moduleCLIs[module][i2]}\t\t${module}`);
      }
    }
  }

  async main(file) {
    system.announce(`Vistta CLI v${process.env.CLI_VERSION}`);
    if (process.env.NODE_ENV === "development") await this.outdated();
    const filepath = fs.resolve(process.cwd(), file);
    if (!fs.existsSync(filepath)) return this.help(`Unknown command/script: "${file}"`);
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