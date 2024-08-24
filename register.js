import "@vistta/console";
import { register } from "node:module";
import { importCLI } from "./utils.js";
import { CLI } from "./index.js";
import { default as DefaultCLI } from "./cli/default.js";

const cli = await importCLI(process.argv[2], { "default": DefaultCLI, "packages": "./cli/packages.js" });
if (!(cli instanceof CLI)) throw new TypeError("Invalid CLI");
global.system = new console.Console("system", { index: -1, date: false });
global.__main = cli.main.bind(cli, ...process.argv.slice(2));
register("./loaders/index.js", import.meta.url, { data: { loaders: cli.loaders, resolve: cli.resolve, options: cli.options } });
system.announce(`Vistta CLI v${process.env.CLI_VERSION}`);