import "@vistta/console/global";
import { register } from "node:module";
import { MessageChannel } from "node:worker_threads";
import { fs, importConfig, saveCrashReport } from "./utils.js";

console.clear();
console.print(`Vistta CLI v${process.env.CLI_VERSION}\n`);

const { port1, port2 } = new MessageChannel();
const shared = {};
const events = {};
global.loaders = {
  send: (event, ...args) => port1.postMessage(JSON.stringify({ event, args })),
  on: (event, callback) => (events[event] ? events[event].push(callback) : (events[event] = [callback])),
  shared: new Proxy(shared, {
    set(_, prop, value) {
      port1.postMessage(JSON.stringify({ sync: true, prop, value }));
      return Reflect.set(...arguments);
    },
  }),
};
port1.on("message", (msg) => {
  const { event, sync, args, prop, value } = JSON.parse(msg);
  if (event) events[event]?.forEach((callback) => callback(...args));
  else if (sync) shared[prop] = value;
});
port1.unref();

const config = await importConfig({
  cli: {
    commands: {
      default: fs.resolve(import.meta.dirname, "./commands/default.js"),
      bundle: fs.resolve(import.meta.dirname, "./commands/bundle.js"),
      project: fs.resolve(import.meta.dirname, "./commands/project.js"),
      test: fs.resolve(import.meta.dirname, "./commands/test.js"),
    },
  },
});
const command = new (await import(config.cli.commands[process.argv[2]] || config.cli.commands["default"])).default();
process.vistta = {
  loaders: command.loaders,
  resolvers: command.resolvers,
  options: config,
  port: port2,
};
register("./loaders/index.js", import.meta.url, { data: process.vistta, transferList: [port2] });
process.vistta.main = command[process.env.NODE_HELP ? "help" : "main"].bind(command, ...process.argv.slice(2));
process.on("uncaughtException", (error) => (console.error(error.stack), saveCrashReport(), process.exit(1)));
process.on("warning", () => {
  /* Do nothing */
});
