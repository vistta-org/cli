import { exec } from "node:child_process";
import { outdated, readJSONFile, writeJSONFile } from "../utils.js";
const USE_SHELL = (await import("node:os")).platform() === "win32";

const command = process.argv[2] || "";
if (!(command === "outdated" || command === "patch" || command === "update")) {
  system.log("Usage: vistta package [outdated|patch|update]");
  process.exit(0);
}

const modules = await outdated();
let valid = true;
let update = 0;
for (let i = 0, len = modules.length; i < len; i++) {
  const { name, package: packagePath, current, wanted, latest, dev } = modules[i];
  if (command === "patch" || command === "update") {
    if (current === wanted) {
      if (command === "patch") continue;
      const packageObj = await readJSONFile(packagePath);
      packageObj[dev ? "devDependencies" : "dependencies"][name] = "^" + latest;
      await writeJSONFile(packagePath, packageObj);
    }
    update++;
  }
  else if (current === wanted) system.info(`Module "${name}" has a new version (${latest})`);
  else system.warn(`Module "${name}" is outdated (${latest})`), (valid = false);
}

if (modules.length == 0) system.log("Everything is up to date");
else if (update > 0) await (new Promise((resolve, reject) =>
  exec("npm update", { shell: USE_SHELL }, (err, stdout, stderr) => {
    if (err || stderr) reject(err || stderr);
    else system.log(`${update} Package${update > 1 ? "s" : ""} updated`), resolve();
  })
));
else system.log("Everything is up to date");
process.exit(valid ? 0 : 1);
