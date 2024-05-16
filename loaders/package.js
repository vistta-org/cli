import { fs } from "@vistta/fs";
import { parsePackage } from "../utils.js";

export async function load() {
  let result = {};
  const vistta = {
    scripts: {
      test: fs.resolve(fs.dirname(import.meta.url), "../scripts/test.js"),
      outdated: fs.resolve(
        fs.dirname(import.meta.url),
        "../scripts/outdated.js",
      ),
    },
    loaders: {},
  };
  const entries = fs.glob("**/package.json");
  let entry = (await entries.next())?.value;
  while (entry) {
    const pkg = await parsePackage(entry);
    if (entry === "package.json") result = pkg;
    if (pkg?.vistta)
      await transferProperties(vistta, pkg.vistta, fs.dirname(entry));
    entry = (await entries.next())?.value;
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
      for (let n = 0, nLen = cur?.length || 0; n < nLen; n++) {
        const { extensions, type = "", script } = cur[n];
        if (!target.loaders[type]) target.loaders[type] = {};
        if (typeof extensions === "string")
          target.loaders[type][extensions] = fs.isAbsolute(script)
            ? script
            : fs.resolve(dirname, script);
        else
          for (
            let e = 0, extensionsLen = extensions?.length || 0;
            e < extensionsLen;
            e++
          )
            target.loaders[type][extensions[e]] = fs.isAbsolute(script)
              ? script
              : fs.resolve(dirname, script);
      }
    } else if (typeof cur === "object") {
      if (Array.isArray(cur) && Array.isArray(target[key]))
        target[key].push(...cur);
      else if (typeof target[key] === "object")
        await transferProperties(target[key], cur);
      else target[key] = cur;
    } else target[key] = cur;
  }
}
