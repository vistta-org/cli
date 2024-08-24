class CLI {
  #options;
  #loaders = {};
  #resolve = ["js", "mjs", "cjs"];

  get options() {
    return this.#options;
  }

  get loaders() {
    return this.#loaders;
  }

  get resolve() {
    return this.#resolve;
  }

  constructor(options) {
    this.#options = options || {};
  }

  register(path, type, extensions = "*", resolve) {
    if (typeof path !== "string") throw new TypeError("Invalid argument: path must be a string");
    if (typeof type !== "string") throw new TypeError("Invalid argument: type must be a string");
    if (!Array.isArray(extensions)) {
      if (typeof extensions === "string") extensions = [extensions];
      else if (extensions != null) throw new TypeError("Invalid argument: type must be either an array or string");
    }
    if (type != "*" && resolve) throw new Error("Automatic extension resolve cannot be set to true on specific import types.");
    if (!this.#loaders[type]) this.#loaders[type] = {};
    for (let i = 0, len = extensions.length; i < len; i++) {
      if (resolve && this.#resolve.indexOf() == -1) this.#resolve.push(extensions[i]);
      this.#loaders[type][extensions[i]] = path;
    }
  }
};

export { CLI };