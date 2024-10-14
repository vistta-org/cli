import { register } from "node:module";
import { importCLI } from "./utils.js";
import { initialize } from "./loaders/index.js";
import { CLI } from "./index.js";
import { default as DefaultCLI } from "./cli/default.js";

const cli = await importCLI(process.argv[2], {
  "default": DefaultCLI,
  "bundle": "./cli/bundle.js",
  "package": "./cli/package.js",
  "test": "./cli/test.js"
});
if (!(cli instanceof CLI)) throw new TypeError("Invalid CLI");
if (process.env.NODE_HELP) global.__main = CLI.bind((cli || (new DefaultCLI())), "help", process.argv.slice(2));
else global.__main = CLI.bind(cli, "main", process.argv.slice(2));
const data = { loaders: cli.loaders, resolve: cli.resolve, options: cli.options };
global.__initialize = () => initialize(data);
register("./loaders/index.js", import.meta.url, { data });
