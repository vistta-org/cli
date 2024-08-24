import fs from "@vistta/fs";
import { build } from "esbuild";
import { dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_OPTIONS = {
  bundle: true,
  write: false,
  outdir: "out",
  legalComments: "none",
  keepNames: true,
  treeShaking: true,
  define: (() => {
    const define = { "process.argv": JSON.stringify(process.argv) };
    const keys = Object.keys(process.env);
    for (let i = 0, len = keys.length; i < len; i++) {
      if (/[():;,.\s]/.test(keys[i])) continue;
      define[`process.env.${keys[i]}`] = JSON.stringify(process.env[keys[i]]);
    }
    define[`process.env`] = JSON.stringify({});
    return define;
  })(),
};
let bundler;

class Bundler {
  constructor(node) {
    this.node = node;
  }

  async run(
    filename,
    { mode = process.env.NODE_ENV, exports, globalName, platform } = {},
  ) {
    const { paths = {}, ...options } = DEFAULT_OPTIONS;
    this.filename = filename;
    this.basename = basename(filename);
    this.dirname = dirname(filename);
    this.paths = paths;
    this.resources = {};
    this.files = [];
    this.exports = exports;
    const filter = /.*/;
    this.options = Object.assign(options, {
      entryPoints: [exports ? "@exports" : filename],
      minify: mode === "production",
      format: globalName ? "iife" : "esm",
      target: "esnext",
      globalName: globalName,
      platform,
      plugins: [
        {
          name: "vistta",
          setup: (build) => (
            build.onResolve({ filter }, this.resolve.bind(this)),
            build.onLoad({ filter }, this.load.bind(this))
          ),
        },
      ],
    });
    const { outputFiles } = await build(this.options);
    this.code = outputFiles?.[0]?.text || "";
    this.files = Array.from(new Set(this.files));
    return this;
  }

  async resolve({ path, importer, resolveDir }) {
    if (path === "@exports")
      return { path: this.basename, namespace: "exports" };
    if (this.paths[path]) return this.paths[path];
    if (!fs.isAbsolute(importer)) importer = fs.resolve(resolveDir, importer);
    const { final, builtin, file } = await this.node.resolve(
      path,
      {
        conditions: ["bundler"],
        parentURL: pathToFileURL(importer).href,
      },
      (final, { builtin, file }) => ({ final, builtin, file }),
    );
    if (!builtin && file) return { path: final };
    if (this.options.platform === "node") return { external: true };
    const exists = await importExists(final);
    if (!builtin && exists) return {};
    return { path: final, namespace: "ignore" };
  }

  async load({ path, namespace, with: importAttributes = {} }) {
    if (namespace === "ignore") return { contents: "" };
    if (namespace === "window")
      return { contents: `module.exports = window.${path};` };
    if (namespace === "exports")
      return {
        contents: `export { ${this.exports} } from "./${this.basename}";`,
        resolveDir: this.dirname,
      };
    importAttributes.bundler = true;
    const {
      source,
      resources,
      files = [],
    } = await this.node.load(path, { importAttributes }, () => ({}));
    this.files.push(...files);
    if (!source) return { loader: "js" };
    for (let i = 0, len = resources?.length || 0; i < len; i++) {
      const { hash, path, code, compiler } = resources[i];
      this.resources[hash] = path || code || compiler;
    }
    return { contents: source, loader: "js" };
  }
}

export { Bundler };

//

export async function initialize(bundlerOptions) {
  const define = DEFAULT_OPTIONS.define;
  Object.assign(DEFAULT_OPTIONS, bundlerOptions);
  Object.assign(DEFAULT_OPTIONS.define, define, bundlerOptions?.define || {});
}

export async function load(_, { path, ...options }) {
  if (!bundler) bundler = new Bundler(this);
  const { code, files, resources } = await bundler.run(path, options);
  return {
    code: `export const code = ${JSON.stringify(code)}; export const files = ${JSON.stringify(files)}; export const resources = ${JSON.stringify(resources)}`,
    resources: resources,
  };
}

//

function importExists(module) {
  return new Promise((resolve) => {
    import(module).then(() => resolve(true)).catch(() => resolve(false));
  });
}
