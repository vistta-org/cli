import { CLI } from "../index.js";
import { fs, importJSON, getOutdatedPackages } from "../utils.js";

export default class extends CLI {
  constructor(options) {
    super(options);
  }

  async main(_, command, packageName) {
    if (command !== "outdated" && command !== "patch" && command !== "update")
      return system.log("Usage: vistta package [outdated|patch|update] [package name]");
    const modules = await getOutdatedPackages(process.cwd());
    let valid = true;
    let update = 0;
    for (let i = 0, len = modules.length; i < len; i++) {
      const { name, package: packagePath, current, wanted, latest, dev } = modules[i];
      if (command === "patch" || command === "update") {
        if (command === "patch" && current === wanted) continue;
        if (packageName && name !== packageName) continue;
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
    process.exit(valid ? 0 : 1);
  }
}