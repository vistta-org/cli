import fs from "@vistta/fs";
import { isBuiltin } from "node:module";
import { fileURLToPath, pathToFileURL, URLSearchParams } from "node:url";

const CWD = process.cwd();
const FALLBACK = "*";

export class Loader {
  static Error = class extends Error {
    constructor(name, message) {
      super(message);
      this.name = name + " Loader Error";
    }
  };

  #loaders;
  #resolve;
  #options;
  #customPathResolve;

  get loaders() {
    return this.#loaders;
  }

  get options() {
    return this.#options;
  }

  constructor({ loaders, resolve, options }) {
    this.#loaders = loaders;
    this.#resolve = resolve;
    this.#options = options;
    this.#customPathResolve = createCustomPathResolver(options?.paths || {}, options?.compiler?.paths || {});
  }

  async resolve(specifier, context, nextResolve, options) {
    [specifier, options] = specifier.split(/\?(.*)/);
    options = new URLSearchParams(options);
    const { parentURL = CWD, conditions: [type] = [] } = context;
    if (isBuiltin(specifier)) {
      if (type === "bundler") context.builtin = true;
      return nextResolve(specifier, context);
    }

    specifier = await this.#customPathResolve(specifier, CWD + "/");
    if (!/^(\w:|\.?\.?\/)/.test(specifier)) return nextResolve(specifier, context);
    if (specifier?.startsWith("file://")) specifier = fileURLToPath(specifier);
    specifier = this.#find(parentURL, specifier);

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
    const extension = fs.extname(path).slice(1);
    const loader = await this.#resolveLoader(extension, options.type);
    if (!loader) return nextLoad(url, context);
    options.path = path;
    options.extension = fs.extname(url).slice(1);
    const { code, warnings, errors, resources, files = [] } = await loader.call(this, await fs.readFile(path, "utf-8"), options);
    if (!code)
      await loader.call(this, await fs.readFile(path, "utf-8"), {
        ...options,
        debug: true,
      });
    if (errors?.length) throw new Loader.Error(loader.name, `${errors.join("\n")}`);
    warnings?.forEach((warning) => console.warn(`${loader.name} Loader Warning: ${warning}\n`));
    return {
      format: "module",
      shortCircuit: true,
      source: code,
      resources: resources,
      files: [options.path, ...files.map((url) => fileURLToPath(url))],
    };
  }

  async #resolveLoader(extension, type = FALLBACK) {
    if (type === FALLBACK && ["js", "mjs", "cjs"].includes(extension)) return null;
    const loader = this.#loaders[type]?.[extension];
    if (!loader) {
      if (extension === FALLBACK) throw new TypeError(`Import attribute "type" with value "${type}" is not supported`);
      else return await this.#resolveLoader(FALLBACK, type);
    }
    if (!loader?.call) {
      const load = (await import(pathToFileURL(loader.path).href))?.load;
      loader.call = (...args) => load.call(...args);
    }
    return loader;
  }

  #find(cwd = process.cwd(), specifier) {
    if (!fs.isAbsolute(specifier)) specifier = fs.resolve(cwd?.startsWith("file://") ? fs.dirname(cwd) : cwd, specifier);
    const len = this.#resolve.length;
    if (fs.existsSync(specifier)) {
      if (!fs.isDirectory(specifier)) return specifier;
      for (let i = 0; i < len; i++) {
        const cur = fs.resolve(specifier, `index.${this.#resolve[i]}`);
        if (fs.existsSync(cur)) return cur;
      }
    }
    for (let i = 0; i < len; i++) {
      const cur = specifier + `.${this.#resolve[i]}`;
      if (fs.existsSync(cur)) return cur;
    }
    return specifier;
  }
}

function createCustomPathResolver(...paths) {
  paths = Object.assign({ "@/*": ["./*"] }, ...paths);
  const pathKeys = Object.keys(paths);
  const pathKeysLen = pathKeys.length;
  return async (path, cwd) => {
    for (let i = 0; i < pathKeysLen; i++) {
      const cur = pathKeys[i];
      const resolved = paths[cur][0];
      if (cur.endsWith("*")) {
        const regex = cur.slice(0, -1);
        if (new RegExp(`^${regex}.*`).test(path) && resolved.endsWith("*"))
          return fs.resolve(cwd, resolved.slice(0, -1), path.replace(new RegExp(`^${regex}`), ""));
      } else if (cur === path) return fs.resolve(cwd, resolved);
    }
    return path;
  };
}
