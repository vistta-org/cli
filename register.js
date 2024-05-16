import { Console } from "@vistta/console";
import { register } from "node:module";
import { outdated } from "./utils.js";

const vistta = {
  loaders: JSON.parse(process.env.VISTTA_LOADERS),
  compilerOptions: JSON.parse(process.env.VISTTA_COMPILER_OPTIONS),
  bundlerOptions: JSON.parse(process.env.VISTTA_BUNDLER_OPTIONS),
};

register("./loaders/index.js", import.meta.url, { data: vistta });
global.console = new Console("");
global.system = new Console("system", { index: -1, date: false });
if (process.env.NODE_ENV)
  (await outdated()).forEach(({ name, current, wanted, latest }) => {
    if (current === wanted)
      system.info(`Module "${name}" has a new version (${latest})`);
    else system.warn(`Module "${name}" is outdated (${latest})`);
  });
system.announce(
  `Vistta CLI v${(await import("./package.json"))?.default?.version}`,
);
