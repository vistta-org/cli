import { Console } from "@vistta/console";
import fs from "@vistta/fs";
import { CLI } from "../index.js";
import { incrementPackageVersion } from "../utils.js";

export default class extends CLI {
  constructor(options) {
    super(options);
    this.define("system", new Console({ date: false, index: -1 }));
    this.define("console", new Console());
  }

  help() {
    system.log("Outputs the current project name or version, or updates the version");
    system.log("\nUsage:");
    system.log("vistta package name\t\t\toutputs current project name");
    system.log("vistta package version\t\t\toutputs current project version");
    system.log("vistta package version [increment]\t\t\tupdates current project version");
  }

  async main(_, command, version) {
    if (command === "name") return system.log(process.env.PROJECT_NAME);
    if (command === "version") {
      if (!version) return system.log(process.env.PROJECT_VERSION);
      return system.log(await incrementPackageVersion(fs.resolve(process.env.PROJECT_PATH, "package.json"), version));
    }
    return this.help();
  }
}