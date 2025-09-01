import fs from "@vistta/fs";
import { isBuiltin } from "node:module";
import { fileURLToPath, pathToFileURL, URLSearchParams } from "node:url";
import { Loader } from "./loader.js";

const CWD = process.cwd();
const FALLBACK = "*";

export class Runtime {
  static Error = class extends Error {
    constructor(name, message) {
      super(message);
      this.name = name + " Loader Error";
    }
  };

  #init;
  #loaders;
  #resolvers;
  #options;

  get loaders() {
    return this.#loaders;
  }

  get options() {
    return this.#options;
  }

  constructor({ loaders, resolvers, options }) {
    this.#init = async () => {
      this.#loaders = {};
      for (let i = 0, len = loaders?.length || 0; i < len; i++) {
        let { main, type, filter } = loaders[i];
        const { default: LoaderClass } = await import(main);
        if (!(LoaderClass?.prototype instanceof Loader)) throw new Runtime.Error(`Invalid loader "${loaders[i].main}"`);
        if (!type) type = FALLBACK;
        if (!this.#loaders[type]) this.#loaders[type] = {};
        this.#loaders[type][filter || FALLBACK] = new LoaderClass(options);
      }
    };
    this.#resolvers = resolvers;
    this.#options = options;
  }

  async resolve(specifier, context, nextResolve, options) {
    if (!this.#loaders) await this.#init();
    [specifier, options] = specifier.split(/\?(.*)/);
    options = new URLSearchParams(options);
    const { parentURL = CWD, conditions: [type] = [] } = context;
    if (isBuiltin(specifier)) {
      if (type === "bundler") context.builtin = true;
      return nextResolve(specifier, context);
    }

    const paths = this.#options?.compiler?.paths || {};
    const pathKeys = Object.keys(paths);
    for (let i = 0, len = pathKeys.length; i < len; i++) {
      const cur = pathKeys[i];
      const resolved = paths[cur][0];
      if (cur.endsWith("*")) {
        const regex = cur.slice(0, -1);
        if (new RegExp(`^${regex}.*`).test(specifier) && resolved.endsWith("*")) {
          specifier = fs.resolve(CWD + "/", resolved.slice(0, -1), specifier.replace(new RegExp(`^${regex}`), ""));
          break;
        }
      } else if (cur === specifier) {
        specifier = fs.resolve(CWD + "/", resolved);
        break;
      }
    }

    if (!/^(\w:|\.?\.?\/)/.test(specifier)) return nextResolve(specifier, context);
    if (specifier?.startsWith("file://")) specifier = fileURLToPath(specifier);

    if (!fs.isAbsolute(specifier))
      specifier = fs.resolve(parentURL?.startsWith("file://") ? fs.dirname(parentURL) : parentURL, specifier);
    const len = this.#resolvers.length;
    if (fs.existsSync(specifier)) {
      if (fs.isDirectory(specifier)) {
        for (let i = 0; i < len; i++) {
          const cur = fs.resolve(specifier, `index.${this.#resolvers[i]}`);
          if (fs.existsSync(cur)) {
            specifier = cur;
            break;
          }
        }
      }
    } else
      for (let i = 0; i < len; i++) {
        const cur = specifier + `.${this.#resolvers[i]}`;
        if (fs.existsSync(cur)) {
          specifier = cur;
          break;
        }
      }

    if (type === "bundler") {
      if (fs.isAbsolute(specifier)) context.file = true;
      return nextResolve(specifier, context);
    }

    const params = options.toString();
    specifier = pathToFileURL(specifier).href;
    if (params.length > 0) return nextResolve(`${specifier}?${params}`, context);
    return nextResolve(specifier, context);
  }

  async load(url, context, nextLoad) {
    if (isBuiltin(url)) return nextLoad(url, context);
    const { ...options } = context?.importAttributes || {};
    url = options.bundler ? pathToFileURL(url.split("?")[0]).href : url.split("?")[0];
    const path = fileURLToPath(url);
    const loader = match(this.#loaders, path, options.type);
    if (!loader) return nextLoad(url, context);
    options.path = path;
    options.extension = fs.extname(url).slice(1);
    const {
      code,
      warnings,
      errors,
      resources,
      files = [],
    } = await loader.load.call(this, await fs.readFile(path, "utf-8"), options);
    if (!code)
      await loader.load.call(this, await fs.readFile(path, "utf-8"), {
        ...options,
        debug: true,
      });
    if (errors?.length) throw new Runtime.Error(loader.name || loader.constructor.name, `${errors.join("\n")}`);
    warnings?.forEach((warning) => console.warn(`${loader.name || loader.constructor.name} Loader Warning: ${warning}\n`));
    return {
      format: "module",
      shortCircuit: true,
      source: code,
      resources: resources,
      files: [options.path, ...files.map((url) => fileURLToPath(url))],
    };
  }
}

function match(loaders, path, type = FALLBACK) {
  if (type === FALLBACK && new RegExp(`^.*\\.(js|mjs|cjs)$`).test(path)) return null;
  const patterns = Object.keys(loaders[type] || {});
  for (let i = 0, len = patterns.length; i < len; i++) {
    const pattern = patterns[i];
    if (pattern === FALLBACK || new RegExp(`^${pattern}$`).test(path)) return loaders[type][pattern];
  }
  if (path === FALLBACK) return null;
  return match(loaders, FALLBACK, type);
}
