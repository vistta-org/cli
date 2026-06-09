import fs from "@vistta/fs";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assign, extract, stripBundler } from "../utils.js";
import { Command } from "./command.js";
import { Runtime } from "./runtime.js";

/**
 * @typedef {{
 *  paths?: Record<string, any>;
 *  exports?: string;
 *  sideEffects?: "none" | string | boolean;
 *  importAttributes?: Record<string, any>;
 *  [key: string]: any;
 * }} BundlerRunOptions
 */

/**
 * @typedef {{
 *  code: string;
 *  files: string[];
 *  resources: Record<string, any>;
 *  errors: any[];
 *  warnings: any[];
 *  warning?: any;
 * }} BundlerRunResult
 */

/**
 * @typedef {{
 *  files: string[];
 *  resources: Record<string, any>;
 *  filename: string;
 *  loader: Runtime;
 *  paths?: Record<string, any>;
 *  exports?: string;
 *  sideEffects?: boolean;
 *  platform?: string;
 *  importAttributes?: Record<string, any>;
 * }} SetupOptions
 */

export class Bundler {
  /** @type {Runtime} */
  #loader;
  /** @type {BundlerRunOptions} */
  #options;

  /**
   * @param {Runtime | Command | undefined} [arg1]
   */
  constructor(arg1) {
    if (arg1 instanceof Runtime) this.#loader = arg1;
    else if (arg1 instanceof Command)
      this.#loader = new Runtime({
        loaders: arg1.loaders,
        resolvers: arg1.resolvers,
        options: process.vistta?.options || {},
      });
    else if (!arg1) this.#loader = new Runtime(process.vistta);
    else throw new Error("Invalid first argument. Expected Loader or CLI instance.");
    this.#options = this.#loader?.options?.bundler ?? {};
  }

  /**
   * @param {string} filename
   * @param {BundlerRunOptions} [options]
   * @returns {Promise<BundlerRunResult>}
   */
  async run(filename, options = {}) {
    const files = [];
    const resources = {};
    assign(options, this.#options);
    const [paths, exports, sideEffects, importAttributes] = extract(
      options,
      "paths",
      "exports",
      "sideEffects",
      "importAttributes",
    );
    options.entryPoints = [exports ? "@exports" : filename];
    options.bundle = true;
    options.outdir ??= "dist";
    options.legalComments ??= "none";
    options.keepNames ??= true;
    options.treeShaking ??= true;
    options.plugins = [];
    options.minify ??= process.env.NODE_ENV === "production";
    options.format ??= options.globalName ? "iife" : "esm";
    options.target ??= "esnext";
    options.logLevel ??= "error";
    options.define ??= {};
    if (options.platform !== "node") {
      options.define[`process`] = "undefined";
      const keys = Object.keys(process.env);
      for (let i = 0, len = keys.length; i < len; i++) {
        if (/[():;,.\s]/.test(keys[i])) continue;
        options.define[`process.env.${keys[i]}`] = JSON.stringify(process.env[keys[i]]);
      }
    }
    options.plugins.unshift(
      setup({
        loader: this.#loader,
        paths,
        filename,
        files,
        resources,
        exports,
        sideEffects: sideEffects !== "none",
        platform: options.platform,
        importAttributes,
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

  /**
   * @param {string} filename
   * @param {BundlerRunOptions} [options]
   * @returns {Promise<any>}
   */
  async import(filename, options = {}) {
    options.write = false;
    const { code, errors, warning } = await this.run(filename, options);
    if (code === "") return { errors, warning };
    return await import(`data:text/javascript;base64,${Buffer.from(code).toString(`base64`)}`);
  }
}

/**
 * @param {SetupOptions} options
 */
function setup({
  files: bundlerFiles,
  resources: bundlerResources,
  filename,
  loader,
  paths = {},
  exports,
  sideEffects,
  platform,
  importAttributes: bundlerImportAttributes = {},
}) {
  const filter = /.*/;
  const basename = fs.basename(filename);
  const dirname = fs.dirname(filename);
  return {
    name: "vistta",
    setup: (build) => (
      build.onResolve({ filter }, async ({ path, importer, resolveDir }) => {
        const cleanPath = stripBundler(path);
        if (cleanPath === "@exports") return { path: basename, namespace: "exports", sideEffects };
        if (paths[cleanPath]) return Object.assign({ sideEffects }, paths[cleanPath]);
        if (!fs.isAbsolute(importer)) importer = fs.resolve(resolveDir, importer);
        const { final, builtin, file } = await loader.resolve(
          cleanPath,
          {
            conditions: ["bundler"],
            parentURL: pathToFileURL(importer).href,
          },
          (final, { builtin, file }) => ({ final, builtin, file }),
        );
        const cleanFinal = stripBundler(final);
        const finalPath = cleanFinal.startsWith("file://") ? fileURLToPath(cleanFinal) : cleanFinal;
        if (!builtin && file) return { path: finalPath, sideEffects };
        if (!builtin) return { sideEffects };
        if (platform === "node") return { external: true };
        return { path: finalPath, namespace: "ignore" };
      }),
      build.onLoad({ filter }, async ({ path, namespace, with: importAttributes }) => {
        const cleanPath = stripBundler(path);
        if (namespace === "ignore") return { contents: "" };
        if (namespace === "window") return { contents: `module.exports = window.${cleanPath};` };
        if (namespace === "global") return { contents: `module.exports = global.${cleanPath};` };
        if (namespace === "exports")
          return {
            contents: `export { ${exports} } from "./${basename}";`,
            resolveDir: dirname,
          };
        if (importAttributes.type === "bundler") delete importAttributes.type;
        importAttributes.bundler = true;
        const mergedImportAttributes = { ...bundlerImportAttributes, ...importAttributes };
        if (cleanPath.match(/\.(jsx|tsx)$/)) delete mergedImportAttributes.type;
        const {
          source,
          resources,
          files = [],
        } = await loader.load(cleanPath, { importAttributes: mergedImportAttributes }, () => ({}));
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
