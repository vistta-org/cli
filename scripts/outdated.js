import { outdated } from "../utils.js";

const modules = await outdated();
let valid = true;
let upToDate = true;
for (let i = 0, len = modules.length; i < len; i++) {
  const { name, current, wanted, latest } = modules[i];
  upToDate = false;
  if (current === wanted)
    system.info(`Module "${name}" has a new version (${latest})`);
  else system.warn(`Module "${name}" is outdated (${latest})`), (valid = false);
}
if (modules.length == 0) system.log("Everything is up to date");
process.exit(valid ? 0 : 1);
