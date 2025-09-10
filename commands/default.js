import { COLORS } from "@vistta/console";
import fs from "@vistta/fs";
import { Command } from "../classes/command.js";

const dirname = import.meta.dirname;

export default class DefaultCommand extends Command {
  constructor() {
    super();
    this.register(fs.resolve(dirname, "../loaders/file.js"));
    this.register(fs.resolve(dirname, "../loaders/typescript.js"), { filter: ".*\\.(ts|mts|cts)" });
    this.register(fs.resolve(dirname, "../loaders/json.js"), { filter: ".*\\.json" });
    this.register(fs.resolve(dirname, "../loaders/bundler.js"), { type: "bundler" });
    this.resolve("ts");
  }

  async help() {
    console.print("vistta <command/script>\n\nAvailable commands:");
    const commands = Object.keys(process.vistta.options.cli.commands);
    let output = "\n\t";
    for (let i = 0, len = commands.length; i < len; i++) {
      if (commands[i] !== "default") output += commands[i] + (i < len - 1 ? ", " : "");
    }
    console.print(output);
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
      const modules = await (await import("../utils.js"))?.getOutdatedPackages(process.cwd());
      for (let i = 0, len = modules.length; i < len; i++) {
        const { name, current, wanted, latest } = modules[i];
        if (current === wanted) console.print(`${COLORS.CYAN}Module "${name}" has a new version (${latest})${COLORS.RESET}`);
        else console.print(`${COLORS.YELLOW}Module "${name}" is outdated (${latest})${COLORS.RESET}`);
      }
    } catch {
      console.print(`${COLORS.YELLOW}Failed to verify modules${COLORS.RESET}`);
    }
  }
}
