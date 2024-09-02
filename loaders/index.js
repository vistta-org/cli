import fs from "@vistta/fs";
import { isBuiltin } from "node:module";
import { fileURLToPath, pathToFileURL, URLSearchParams } from "node:url";
import {
  initialize as initializeTypescript,
  resolve as typescriptResolve,
} from "./typescript.js";
import { initialize as initializeBundler } from "./bundler.js";

const CWD = process.cwd();
const FALLBACK = "*";
let instance;

export async function initialize({ loaders, resolve: _resolve, options }) {
  await initializeTypescript(options?.compiler || {});
  await initializeBundler({ resolve, load, options: options?.bundler || {} });
  instance = { loaders, resolve: _resolve };
}

export async function resolve(specifier, context, nextResolve, options) {
  [specifier, options] = specifier.split(/\?(.*)/);
  options = new URLSearchParams(options);
  const { parentURL = CWD, conditions: [type] = [] } = context;
  if (isBuiltin(specifier)) {
    if (type === "bundler") context.builtin = true;
    return nextResolve(specifier, context);
  }

  specifier = await typescriptResolve(specifier, CWD + "/");
  if (!/^(\w:|\.?\.?\/)/.test(specifier))
    return nextResolve(specifier, context);
  if (specifier?.startsWith("file://")) specifier = fileURLToPath(specifier);
  specifier = resolver(specifier, { cwd: parentURL });

  if (type === "bundler") {
    if (fs.isAbsolute(specifier)) context.file = true;
    return nextResolve(specifier, context);
  }

  const params = options.toString();
  specifier = pathToFileURL(specifier).href;
  if (params.length > 0) return nextResolve(`${specifier}?${params}`, context);
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (isBuiltin(url)) return nextLoad(url, context);
  const { ...options } = context?.importAttributes || {};
  url = options.bundler
    ? pathToFileURL(url.split("?")[0]).href
    : url.split("?")[0];
  const path = fileURLToPath(url);
  const extension = fs.extname(url).slice(1);
  const loader = await getLoader(extension, options.type);
  if (!loader) return nextLoad(url, context);
  options.path = path;
  options.extension = fs.extname(url).slice(1);
  const {
    code,
    warnings,
    errors,
    resources,
    files = [],
  } = await loader.call(
    { load, resolve },
    await fs.readFile(path, "utf-8"),
    options,
  );
  if (errors?.length) throw new Error(errors.join("\n"));
  warnings?.forEach((warning) => console.warn(`Loader Warning: ${warning}\n`));
  return {
    format: "module",
    shortCircuit: true,
    source: code,
    resources: resources,
    files: [options.path, ...files.map((url) => fileURLToPath(url))],
  };
}

//

function resolver(
  specifier,
  { cwd = process.cwd(), extensions = instance.resolve } = {},
) {
  if (!fs.isAbsolute(specifier))
    specifier = fs.resolve(
      cwd?.startsWith("file://") ? fs.dirname(cwd) : cwd,
      specifier,
    );
  if (fs.existsSync(specifier)) {
    if (!fs.isDirectory(specifier)) return specifier;
    for (let i = 0, len = extensions.length; i < len; i++) {
      const cur = fs.resolve(specifier, `index.${extensions[i]}`);
      if (fs.existsSync(cur)) return cur;
    }
  }
  for (let i = 0, len = extensions.length; i < len; i++) {
    const cur = specifier + `.${extensions[i]}`;
    if (fs.existsSync(cur)) return cur;
  }
  return specifier;
}

async function getLoader(extension, type = FALLBACK) {
  if (type === FALLBACK && ["js", "mjs", "cjs"].includes(extension)) return null;
  const loader = instance.loaders[type]?.[extension];
  if (!loader) {
    if (extension === FALLBACK)
      throw new TypeError(
        `Import attribute "type" with value "${type}" is not supported`,
      );
    else return await getLoader(FALLBACK, type);
  }
  if (typeof loader === "string") instance.loaders[type][extension] = (await import(loader))?.load;
  return instance.loaders[type]?.[extension];
}