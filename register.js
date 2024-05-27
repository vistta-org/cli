import "@vistta/console";
import { register } from "node:module";
import { outdated, disableExperimentalWarnings, exposeTestFunctions } from "./utils.js";

disableExperimentalWarnings();
const vistta = {
  loaders: JSON.parse(process.env.VISTTA_LOADERS),
  compilerOptions: JSON.parse(process.env.VISTTA_COMPILER_OPTIONS),
  bundlerOptions: JSON.parse(process.env.VISTTA_BUNDLER_OPTIONS),
  defaultExtensions: JSON.parse(process.env.VISTTA_DEFAULT_EXTENSIONS),
};

register("./loaders/index.js", import.meta.url, { data: vistta });
global.system = new console.Console("system", { index: -1, date: false });
if (process.env.NODE_ENV === "development")
  (await outdated()).forEach(({ name, current, wanted, latest }) => {
    if (current === wanted)
      system.info(`Module "${name}" has a new version (${latest})`);
    else system.warn(`Module "${name}" is outdated (${latest})`);
  });
if (process.env.NODE_ENV === "test") await exposeTestFunctions();
system.announce(
  `Vistta CLI v${(await import("./package.json"))?.default?.version}`,
);
