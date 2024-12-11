import fs from "@vistta/fs";
import { CLI } from "../index.js";
import { incrementPackageVersion } from "../utils.js";

export default class extends CLI {
  constructor(options) {
    super(options);
  }

  help() {
    console.print("Outputs the current project name or version, or updates the version");
    console.print("\nUsage:");
    console.print("vistta package name\t\t\toutputs current project name");
    console.print("vistta package version\t\t\toutputs current project version");
    console.print("vistta package version [increment]\t\t\tupdates current project version");
  }

  async main(_, command, version) {
    if (command === "name") return console.print(process.env.PROJECT_NAME);
    if (command === "version") {
      if (!version) return console.print(process.env.PROJECT_VERSION);
      return console.print(await incrementPackageVersion(fs.resolve(process.env.PROJECT_PATH, "package.json"), version));
    }
    return this.help();
  }
}