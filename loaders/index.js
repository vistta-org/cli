import { Runtime } from "../classes/runtime.js";

let runtime;

export async function initialize({ loaders, resolvers, options, port }) {
  runtime = new Runtime({ loaders, resolvers, options });
  if (port) {
    const shared = {};
    const events = {};
    global.main = {
      send: (event, ...args) => args.port.postMessage(JSON.stringify({ event, args })),
      on: (event, callback) => (events[event] ? events[event].push(callback) : (events[event] = [callback])),
      shared: new Proxy(shared, {
        set(_, prop, value) {
          port.postMessage(JSON.stringify({ sync: true, prop, value }));
          return Reflect.set(...arguments);
        },
      }),
    };
    port.on("message", (msg) => {
      const { event, sync, args, prop, value } = JSON.parse(msg);
      if (event) events[event]?.forEach((callback) => callback(...args));
      else if (sync) shared[prop] = value;
    });
  }
}

export async function resolve(specifier, context, nextResolve, options) {
  return runtime.resolve(specifier, context, nextResolve, options);
}

export async function load(url, context, nextLoad) {
  return runtime.load(url, context, nextLoad);
}
