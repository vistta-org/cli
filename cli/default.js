import fs from "@vistta/fs";
import { CLI } from "../index.js";
import { COLORS } from "@vistta/console";

const dirname = import.meta.dirname;

export default class extends CLI {
  constructor(options) {
    super(options);
    this.register(fs.resolve(dirname, "../loaders/file.js"), "File", "*");
    this.register(
      fs.resolve(dirname, "../loaders/typescript.js"),
      "Typescript",
      "*",
      ["ts", "mts", "cts"],
      true
    );
    this.register(
      fs.resolve(dirname, "../loaders/json.js"),
      "JSON",
      "*",
      "json"
    );
    this.register(
      fs.resolve(dirname, "../loaders/bundler.js"),
      "Bundler",
      "bundler"
    );
  }

  async help() {
    const moduleCLIs = await (await import("../utils.js"))?.availableCommands();
    console.print("vistta <command/script>\n\nAvailable commands:");
    console.print("\tbundle, package, install, add, uninstall,");
    console.print("\tremove, run, update, patch, outdated, test");
    const modules = Object.keys(moduleCLIs);
    for (let i = 0, len = modules.length; i < len; i++) {
      const module = modules[i];
      const list = [];
      for (let i2 = 0, len2 = moduleCLIs[module].length; i2 < len2; i2++) {
        if (moduleCLIs[module][i2] === "default") continue;
        list.push(moduleCLIs[module][i2]);
      }
      console.print(`From ${module}:\n\t${list.join(", ")}`);
    }
  }

  async main(file) {
    if (process.env.NODE_ENV === "development") await this.outdated();
    const filepath = fs.resolve(process.cwd(), file);
    if (!fs.existsSync(filepath)) {
      console.print(`Unknown command/script "${file}"\n`);
      return this.help();
    }
    import(filepath);
  }

  async outdated() {
    try {
      const modules = await (
        await import("../utils")
      )?.getOutdatedPackages(process.cwd());
      for (let i = 0, len = modules.length; i < len; i++) {
        const { name, current, wanted, latest } = modules[i];
        if (current === wanted)
          console.print(
            `${COLORS.CYAN}Module "${name}" has a new version (${latest})${COLORS.RESET}`
          );
        else
          console.print(
            `${COLORS.YELLOW}Module "${name}" is outdated (${latest})${COLORS.RESET}`
          );
      }
    } catch {
      console.print(`${COLORS.YELLOW}Failed to verify modules${COLORS.RESET}`);
    }
  }
}
