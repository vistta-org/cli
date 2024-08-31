import { Console } from "@vistta/console";
import { CLI } from "../index.js";
import { fs, importJSON, getOutdatedPackages, incrementPackageVersion } from "../utils.js";

export default class extends CLI {
  constructor(options) {
    super(options);
    this.define("system", new Console({ date: false, index: -1 }));
    this.define("console", new Console());
  }

  help() {
    system.log("vistta package <command>");
    system.log("\nUsage:\n");
    system.log("vistta package name\t\t\toutputs current project name");
    system.log("vistta package version\t\t\toutputs current project version");
    system.log("vistta package version [increment]\t\t\tupdates current project version");
    system.log("vistta package outdated\t\t\tchecks outdated modules in current project");
    system.log("vistta package outdated [package]\tchecks if a specific package is outdated");
    system.log("vistta package patch\t\t\tpatches security outdated modules in current project");
    system.log("vistta package patch [package]\t\tpatches a specific security outdated package");
    system.log("vistta package update\t\t\tupdates outdated modules in current project");
    system.log("vistta package update [package]\t\tupdates a specific outdated package");
  }
  async main(_, command, arg1) {
    if (command === "name") return system.log(process.env.PROJECT_NAME);
    if (command === "version") {
      if (!arg1) return system.log(process.env.PROJECT_VERSION);
      return system.log(await incrementPackageVersion(fs.resolve(process.env.PROJECT_PATH, "package.json"), arg1));
    }
    if (command !== "outdated" && command !== "patch" && command !== "update")
      return this.help();
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
    else if (update > 0) console.log(`${update} Package${update > 1 ? "s" : ""} updated, proceed with preferred install command`);
    process.exit(valid ? 0 : -1);
  }
}