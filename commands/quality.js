import { Command } from "../classes/command.js";
import { loadProjectConfig, mergeConfig } from "../config.js";
import { runChecks } from "../tools.js";
import { parseArgs } from "../utils.js";

export default class extends Command {
  help() {
    console.log(
      "vistta check [patterns] [--fix]\nvistta lint [patterns] [--fix]\nvistta fmt [patterns] [--write]\nvistta types\nvistta config [--sources]",
    );
  }

  async main(command, ...argv) {
    const [patterns, options] = parseArgs(argv);
    const allowed = command === "config" ? ["sources"] : command === "fmt" ? ["write", "check", "fix"] : ["fix"];
    for (const [option, value] of Object.entries(options)) {
      if (!allowed.includes(option)) throw new Error(`Unknown option --${option}`);
      if (typeof value !== "boolean") throw new Error(`--${option} must be a boolean flag`);
    }
    if (["types", "config"].includes(command) && patterns.length)
      throw new Error(`${command} does not accept file patterns`);
    if (command === "fmt" && options.check && (options.write || options.fix))
      throw new Error("Use either --check or --write, not both");
    const project = loadProjectConfig();
    if (command === "config") {
      const defaults = {
        cli: {
          check: { format: true, lint: true, types: true },
          lint: { engine: "eslint" },
          format: { engine: "prettier" },
        },
      };
      const config = mergeConfig(defaults, project.config);
      const sources = {
        "cli.check.format": "<default>",
        "cli.check.lint": "<default>",
        "cli.check.types": "<default>",
        "cli.lint.engine": "<default>",
        "cli.format.engine": "<default>",
        ...project.sources,
      };
      console.print(JSON.stringify(options.sources ? { file: project.file, config, sources } : config, null, 2));
      return;
    }
    const names =
      command === "check"
        ? ["format", "lint", "types"].filter((name) => project.config.cli?.check?.[name] !== false)
        : [command === "fmt" ? "format" : command];
    const code = await runChecks(names, project, { patterns, fix: options.fix === true || options.write === true });
    process.exit(code);
  }
}
