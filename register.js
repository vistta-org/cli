import { register } from "node:module";
import { importCLI } from "./utils.js";
import { CLI } from "./index.js";
import { default as DefaultCLI } from "./cli/default.js";

const commands = {
  "default": DefaultCLI,
  "bundle": "./cli/bundle.js",
  "package": "./cli/package.js",
  "install": "./cli/npm.js",
  "add": "./cli/npm.js",
  "uninstall": "./cli/npm.js",
  "remove": "./cli/npm.js",
  "update": "./cli/npm.js",
  "patch": "./cli/npm.js",
  "outdated": "./cli/npm.js",
  "test": "./cli/test.js",
};
const cli = await importCLI(process.argv[2], commands);
if (!(cli instanceof CLI)) throw new TypeError("Invalid CLI");
global.vistta = { loaders: cli.loaders, resolve: cli.resolve, options: cli.options };
register("./loaders/index.js", import.meta.url, { data: global.vistta });
global.vistta.main = cli[process.env.NODE_HELP ? "help" : "main"].bind(cli, ...process.argv.slice(2));
