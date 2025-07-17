import fs from "@vistta/fs";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { assign, extract } from "../utils.js";
import { CLI } from "./cli.js";
import { Loader } from "./loader.js";

export class Bundler {
  #loader;
  #options;

  constructor(arg1) {
    if (arg1 instanceof Loader) this.#loader = arg1;
    else if (arg1 instanceof CLI) this.#loader = new Loader(arg1);
    else if (!arg1) this.#loader = new Loader(process.vistta);
    else throw new Error("Invalid first argument. Expected Loader or CLI instance.");
    this.#options = this.#loader?.options?.bundler ?? {};
  }

  async run(filename, options = {}) {
    const files = [];
    const resources = {};
    assign(options, this.#options);
    const [paths, exports] = extract(options, "paths", "exports");
    options.entryPoints = [exports ? "@exports" : filename];
    options.bundle = true;
    options.outdir ??= "dist";
    options.legalComments ??= "none";
    options.keepNames ??= true;
    options.treeShaking ??= true;
    options.define ??= {};
    options.plugins = [];
    options.minify ??= process.env.NODE_ENV === "production";
    options.format ??= options.globalName ? "iife" : "esm";
    options.target ??= "esnext";
    options.define[`process`] = "undefined";
    const keys = Object.keys(process.env);
    for (let i = 0, len = keys.length; i < len; i++) {
      if (/[():;,.\s]/.test(keys[i])) continue;
      options.define[`process.env.${keys[i]}`] = JSON.stringify(process.env[keys[i]]);
    }
    options.plugins.unshift(
      setup({
        loader: this.#loader,
        paths,
        filename,
        files,
        resources,
        exports,
        platform: options.platform,
      }),
    );
    const { outputFiles, errors, warnings } = await build(options);
    return {
      code: outputFiles?.[0]?.text ?? "",
      files: Array.from(new Set(files)),
      resources,
      errors,
      warnings,
    };
  }

  async import(filename, options = {}) {
    options.write = false;
    const { code, errors, warning } = await this.run(filename, options);
    if (code === "") return { errors, warning };
    return await import(`data:text/javascript;base64,${Buffer.from(code).toString(`base64`)}`);
  }
}

// eslint-disable-next-line no-unused-vars
function setup({ files: bundlerFiles, resources: bundlerResources, filename, loader, paths = {}, exports, platform }) {
  const filter = /.*/;
  const basename = fs.basename(filename);
  const dirname = fs.dirname(filename);
  return {
    name: "vistta",
    setup: (build) => (
      build.onResolve({ filter }, async ({ path, importer, resolveDir }) => {
        if (path === "@exports") return { path: basename, namespace: "exports" };
        if (paths[path]) return paths[path];
        if (!fs.isAbsolute(importer)) importer = fs.resolve(resolveDir, importer);
        const { final, builtin, file } = await loader.resolve(
          path,
          {
            conditions: ["bundler"],
            parentURL: pathToFileURL(importer).href,
          },
          (final, { builtin, file }) => ({ final, builtin, file }),
        );
        if (!builtin && file) return { path: final };
        if (platform === "node") return { external: true };
        if (!builtin) return {};
        return { path: final, namespace: "ignore" };
      }),
      build.onLoad({ filter }, async ({ path, namespace, with: importAttributes = {} }) => {
        if (namespace === "ignore") return { contents: "" };
        if (namespace === "window") return { contents: `module.exports = window.${path};` };
        if (namespace === "global") return { contents: `module.exports = global.${path};` };
        if (namespace === "exports")
          return {
            contents: `export { ${exports} } from "./${basename}";`,
            resolveDir: dirname,
          };
        importAttributes.bundler = true;
        const { source, resources, files = [] } = await loader.load(path, { importAttributes }, () => ({}));
        bundlerFiles.push(...files);
        if (!source) return { loader: "js" };
        for (let i = 0, len = resources?.length || 0; i < len; i++) {
          const { hash, path, code, compiler } = resources[i];
          bundlerResources[hash] = path || code || compiler;
        }
        return { contents: source, loader: "js" };
      })
    ),
  };
}
