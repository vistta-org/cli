import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "../classes/command.js";
import { loadProjectConfig } from "../config.js";
import { planTasks, runTasks } from "../tools.js";

export default class extends Command {
  help() {
    console.log("vistta task <name> [-- args]\nvistta run <name> [-- args] (unless overridden by a framework)");
  }

  async main(_, name, ...args) {
    if (!name) return this.help();
    const cwd = process.cwd();
    const { config } = loadProjectConfig(cwd);
    const { scripts = {} } = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
    const commands = Object.keys(process.vistta.options.cli.commands).filter(
      (name) => !["default", "run", "task"].includes(name),
    );
    const plan = planTasks(name, config.cli?.tasks, scripts, commands);
    process.exit(await runTasks(plan, cwd, args[0] === "--" ? args.slice(1) : args));
  }
}
