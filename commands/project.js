import { COLORS } from "@vistta/console";
import fs from "@vistta/fs";
import { capitalize } from "@vistta/utils";
import { Command } from "../classes/command.js";
import { getOutdatedPackages, importJSON, incrementPackageVersion } from "../utils.js";

const HELP = {
  name: "outputs current project name",
  version: "outputs the project version",
  "version [increment]": "updates the project version",
  outdated: "lists all outdated modules in the project",
  patch: "updates the version of outdated modules to the latest patch version in the project",
  "patch [module]": "updates the version of outdated module to the latest patch version in the project",
  update: "updates the version of outdated modules to the latest version in the project",
  "update [module]": "updates the version of outdated module to the latest version in the project",
};

export default class extends Command {
  constructor(options) {
    super(options);
  }

  help(_, command) {
    switch (command) {
      case "name":
        console.print(capitalize(HELP["name"]));
        console.print("\nUsage:");
        console.print("vistta project name");
        break;
      case "version":
        console.print(capitalize(HELP["version"]) + " or " + HELP["version [increment]"]);
        console.print("\nUsage:");
        console.print("vistta project version");
        console.print("vistta project version [increment]");
        break;
      case "outdated":
        console.print(capitalize(HELP["outdated"]));
        console.print("\nUsage:");
        console.print("vistta project outdated");
        break;
      case "patch":
        console.print(capitalize(HELP["patch"]) + " or " + HELP["patch [module]"]);
        console.print("\nUsage:");
        console.print("vistta project patch");
        console.print("vistta project patch [module]");
        break;
      case "update":
        console.print(capitalize(HELP["update"]) + " or " + HELP["update [module]"]);
        console.print("\nUsage:");
        console.print("vistta project update");
        console.print("vistta project update [module]");
        break;
      default:
        console.print("Outputs the current project name or version, or updates the version");
        console.print("\nUsage:");
        Object.keys(HELP).forEach((key) => console.print(`vistta project ${key}\t\t\t${HELP[key]}`));
        break;
    }
  }

  async main(_, command, ...args) {
    console.clear();
    switch (command) {
      case "name":
        return console.print(process.env.PROJECT_NAME);
      case "version":
        if (!args[0]) return console.print(process.env.PROJECT_VERSION);
        return console.print(
          await incrementPackageVersion(fs.resolve(process.env.PROJECT_PATH, "package.json"), args[0], args[1]),
        );
      case "outdated":
      case "patch":
      case "update":
        return modules(command, args[0]);
    }
    return this.help(_, command);
  }
}

async function modules(command, arg1) {
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
    } else if (current === wanted)
      console.print(`${COLORS.CYAN}Module "${name}" has a new version (${latest})${COLORS.RESET}`);
    else (console.print(`${COLORS.YELLOW}Module "${name}" is outdated (${latest})${COLORS.RESET}`), (valid = false));
  }

  if (modules.length == 0) console.print("Everything is up to date");
  else if (update > 0) console.print(`Updated ${update} module${update > 1 ? "s" : ""} versions in project package.`);
  process.exit(valid ? 0 : -1);
}
