import { register } from "node:module";
import { MessageChannel } from 'node:worker_threads';
import { importCLI, saveCrashReport } from "./utils.js";
import { CLI } from "./index.js";
import { default as DefaultCLI } from "./cli/default.js";
import "@vistta/console/global";

const { port1, port2 } = new MessageChannel();
const shared = {};
const events = {};
global.loaders = {
  send: (event, ...args) => port1.postMessage(JSON.stringify({ event, args })),
  on: (event, callback) => events[event] ? events[event].push(callback) : events[event] = [callback],
  shared: new Proxy(shared, {
    set(_, prop, value) {
      port1.postMessage(JSON.stringify({ sync: true, prop, value }));
      return Reflect.set(...arguments);
    }
  })
};
port1.on('message', (msg) => {
  const { event, sync, args, prop, value } = JSON.parse(msg);
  if (event) events[event]?.forEach(callback => callback(...args));
  else if (sync) shared[prop] = value;
})
port1.unref();

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
console.clear();
console.print(`Vistta CLI v${process.env.CLI_VERSION}\n`);
process.vistta = { loaders: cli.loaders, resolve: cli.resolve, options: cli.options, port: port2 };
register("./loaders/index.js", import.meta.url, { data: process.vistta, transferList: [port2] });
process.vistta.main = cli[process.env.NODE_HELP ? "help" : "main"].bind(cli, ...process.argv.slice(2));
process.on('uncaughtException', (error) => (console.error(error.stack), saveCrashReport(), process.exit(1)));
process.on('warning', () => { /* Do nothing */ });