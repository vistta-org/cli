import fs from "@vistta/fs";
import { readJSONFile, getProjectPackage, getProjectPackages } from "../utils.js";

export async function load() {
  const vistta = {
    scripts: {
      test: fs.resolve(fs.dirname(import.meta.url), "../scripts/test.js"),
      outdated: fs.resolve(
        fs.dirname(import.meta.url),
        "../scripts/outdated.js",
      ),
      default: fs.resolve(fs.dirname(import.meta.url), "../scripts/default.js")
    },
    loaders: {},
    defaultExtensions: [],
  };
  const result = await getProjectPackage();
  const packages = Object.keys(await getProjectPackages());
  for (let i = 0, len = packages.length; i < len; i++) {
    const pkg = await readJSONFile(packages[i] + "/package.json");
    if (pkg?.vistta)
      await transferProperties(vistta, pkg.vistta, packages[i]);
  }

  result.vistta = vistta;
  return result;
}

//

async function transferProperties(target, props, dirname) {
  const keys = Object.keys(props || {});
  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i];
    const cur = props[key];
    if (dirname && key === "scripts") {
      const scripts = Object.keys(cur || {});
      for (let n = 0, nLen = scripts?.length || 0; n < nLen; n++) {
        const script = scripts[n];
        if (!target.scripts[script])
          target.scripts[script] = fs.resolve(dirname, cur[script]);
      }
    } else if (dirname && key === "loaders") {
      for (let n = 0, nLen = cur?.length || 0; n < nLen; n++)
        addLoader(target, dirname, cur[n]);
    } else if (typeof cur === "object") {
      if (Array.isArray(cur) && Array.isArray(target[key]))
        target[key].push(...cur);
      else if (typeof target[key] === "object")
        await transferProperties(target[key], cur);
      else target[key] = cur;
    } else target[key] = cur;
  }
}

function addLoader(target, dirname, loader) {
  const script = loader.script;
  if (typeof script !== "string") return;
  const types = extractValues(loader?.type, loader?.types);
  const extensions = extractValues(loader?.extension, loader?.extensions);
  const addDefault = loader.default;
  for (let i = 0, typesLen = types.length; i < typesLen; i++) {
    const type = types[i];
    if (!target.loaders[type]) target.loaders[type] = {};
    for (let j = 0, extensionsLen = extensions.length; j < extensionsLen; j++) {
      const extension = extensions[j];
      target.loaders[type][extension] = fs.isAbsolute(script)
        ? script
        : fs.resolve(dirname, script);
      if (addDefault) target.defaultExtensions.push(extension);
    }
  }
}

function extractValues(single, multiple) {
  if (typeof single === "string") return [single];
  if (Array.isArray(multiple)) return multiple;
  return ["default"];
}