class CLI {
  #loaders = {};
  #resolve = ["js", "mjs", "cjs"];

  static bind(instance, method, args) {
    if(instance.options.parseArge !== false) {
      let i = 0;
      const parse = (value) => {
        if (value == null || value === "true") return true;
        if (value === "false") return false;
        return value;
      }
      while (i < args.length) {
        const [option, value] = args[i].toLowerCase().split("=");
        if (option.startsWith("--")) {
          instance.options[option.slice(2)] = parse(value);
          args.splice(i, 1);
        }
        else i++;
      }
    }
    return instance[method].bind(instance, ...args);
  }

  get loaders() {
    return this.#loaders;
  }

  get resolve() {
    return this.#resolve;
  }

  constructor(options) {
    this.options = options || {};
  }

  register(path, name, type, extensions = "*", resolve) {
    if (typeof path !== "string") throw new TypeError("Invalid argument: path must be a string");
    if (typeof name !== "string") throw new TypeError("Invalid argument: name must be a string");
    if (typeof type !== "string") throw new TypeError("Invalid argument: type must be a string");
    if (!Array.isArray(extensions)) {
      if (typeof extensions === "string") extensions = [extensions];
      else if (extensions != null) throw new TypeError("Invalid argument: type must be either an array or string");
    }
    if (type != "*" && resolve) throw new Error("Automatic extension resolve cannot be set to true on specific import types.");
    if (!this.#loaders[type]) this.#loaders[type] = {};
    for (let i = 0, len = extensions.length; i < len; i++) {
      if (resolve && this.#resolve.indexOf() == -1) this.#resolve.push(extensions[i]);
      this.#loaders[type][extensions[i]] = { name, path };
    }
  }

  define(key, value) {
    global[key] = value;
  }

  env(key, value) {
    process.env[key] = value;
  }
};

export { Bundler } from "./loaders/bundler.js";
export { CLI };