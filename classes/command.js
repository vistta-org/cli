/* eslint-disable no-unused-vars */
/**
 * @define {Object} LoaderConfig
 * @property {string} main The path to the module exporting the loader class
 * @property {string} [type] The import attribute type that the loader supports
 * @property {string} [filter] A filter to match against the specifier
 */

export class Command {
  #loaders = [];
  #resolvers = ["js"];

  get loaders() {
    return this.#loaders;
  }

  get resolvers() {
    return this.#resolvers;
  }

  /**
   * Optional method to display help about the plugin.
   * @param {...string} args
   */
  help(...args) {
    // Optional: subclasses may implement if needed
  }

  /**
   * Main method to execute the plugin.
   * @abstract
   * @param {...string} args
   */
  main(...args) {
    throw new Error("Method 'main' must be implemented.");
  }

  /**
   * Registers a new loader.
   * @param {string} path - The path to the module exporting the loader class
   * @param {Object} [options] - The loader options
   * @param {string} [options.type] - The import attribute type that the loader supports
   * @param {string} [options.filter] - A filter to match against the specifier
   */
  register(path, options = {}) {
    this.#loaders.push({ main: path, ...options });
  }

  /**
   * Adds new file extensions to resolve without needing to specify them.
   * @param {...string} extensions - The file extensions to add (without the dot)
   */
  resolve(...extensions) {
    this.#resolvers.push(...extensions);
  }

  /**
   * Defines either an environment variable or a global variable.
   * @param {"global"|"env"} type - Either environment or global.
   * @param {string} key - The key.
   * @param {any} value - The value.
   */
  define(type, key, value) {
    if (type === "env") process.env[key] = value?.toString() ?? "";
    else if (type === "global") global[key] = value;
    else throw new Error(`Unknown define type "${type}"`);
  }
}

export default Command;
