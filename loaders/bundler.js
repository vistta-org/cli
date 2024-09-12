import fs from "@vistta/fs";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { assign, extract, remove } from "../utils.js";

let instance;

export async function bundle(options = {}) {
  const files = [];
  const resources = {};
  if (!instance) await global.__initialize();
  const { load, resolve } = instance;
  assign(options, instance.options);
  const [filename, paths, exports] = extract(options, "filename", "paths", "exports");
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
  options.plugins.unshift(setup({ resolve, load, paths, filename, files, resources, exports, platform: options.platform }));
  const { outputFiles, errors, warnings } = await build(options);
  return {
    code: outputFiles?.[0]?.text ?? "",
    files: Array.from(new Set(files)),
    resources, errors, warnings
  };
}

export async function initialize({ resolve, load, options }) {
  instance = { resolve, load, options };
}

export async function load(_, { path, ...options }) {
  options.filename = path;
  options.write = false;
  remove(options, "type", "extension");
  const { code, files, resources, errors, warnings } = await bundle(options);
  return {
    code: `export const code = ${JSON.stringify(code)}; ` +
      `export const files = ${JSON.stringify(files)}; ` +
      `export const resources = ${JSON.stringify(resources)}; ` +
      `export const errors = ${JSON.stringify(errors)}; ` +
      `export const warnings = ${JSON.stringify(warnings)};`,
    resources: resources,
  };
}

// eslint-disable-next-line no-unused-vars
function setup({ files: bundlerFiles, resources: bundlerResources, filename, load, resolve, paths = {}, exports, platform }) {
  const filter = /.*/;
  const basename = fs.basename(filename);
  const dirname = fs.dirname(filename);
  return {
    name: "vistta",
    setup: (build) => (
      build.onResolve({ filter }, async ({ path, importer, resolveDir }) => {
        if (path === "@exports")
          return { path: basename, namespace: "exports" };
        if (paths[path]) return paths[path];
        if (!fs.isAbsolute(importer)) importer = fs.resolve(resolveDir, importer);
        const { final, builtin, file } = await resolve(
          path,
          {
            conditions: ["bundler"],
            parentURL: pathToFileURL(importer).href,
          },
          (final, { builtin, file }) => ({ final, builtin, file }),
        );
        if (!builtin && file) return { path: final };
        if (platform === "node") return { external: true };
        const exists = await importExists(final);
        if (!builtin && exists) return {};
        return { path: final, namespace: "ignore" };
      }),
      build.onLoad({ filter }, async ({ path, namespace, with: importAttributes = {} }) => {
        if (namespace === "ignore") return { contents: "" };
        if (namespace === "window")
          return { contents: `module.exports = window.${path};` };
        if (namespace === "exports")
          return {
            contents: `export { ${exports} } from "./${basename}";`,
            resolveDir: dirname,
          };
        importAttributes.bundler = true;
        const {
          source,
          resources,
          files = [],
        } = await load(path, { importAttributes }, () => ({}));
        bundlerFiles.push(...files);
        if (!source) return { loader: "js" };
        for (let i = 0, len = resources?.length || 0; i < len; i++) {
          const { hash, path, code, compiler } = resources[i];
          bundlerResources[hash] = path || code || compiler;
        }
        return { contents: source, loader: "js" };
      })
    ),
  }
}

function importExists(module) {
  return new Promise((resolve) => {
    import(module).then(() => resolve(true)).catch(() => resolve(false));
  });
}