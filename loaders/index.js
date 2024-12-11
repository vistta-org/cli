import { Loader } from "../classes/loader.js";
import { initialize as initializeTypescript } from "./typescript.js";

let instance;

export async function initialize(args) {
  await initializeTypescript(args?.options?.compiler || {});
  if (args.port) {
    const shared = {};
    const events = {};
    global.main = {
      send: (event, ...args) => args.port.postMessage(JSON.stringify({ event, args })),
      on: (event, callback) => events[event] ? events[event].push(callback) : events[event] = [callback],
      shared: new Proxy(shared, {
        set(_, prop, value) {
          args.port.postMessage(JSON.stringify({ sync: true, prop, value }));
          return Reflect.set(...arguments);
        }
      })
    };
    args.port.on('message', (msg) => {
      const { event, sync, args, prop, value } = JSON.parse(msg);
      if (event) events[event]?.forEach(callback => callback(...args));
      else if (sync) shared[prop] = value;
    });
  }
  instance = new Loader(args);
}

export async function resolve(specifier, context, nextResolve, options) {
  return instance.resolve(specifier, context, nextResolve, options);
}

export async function load(url, context, nextLoad) {
  return instance.load(url, context, nextLoad)
}