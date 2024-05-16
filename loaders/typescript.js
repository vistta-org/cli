import { fs } from "@vistta/fs";
import { transform } from "esbuild";

export const tsconfig = { compilerOptions: {} };

export async function initialize(compilerOptions) {
  await transferProperties(
    tsconfig,
    loadTSConfig(fs.resolve(fs.dirname(import.meta.url), "../")),
  );
  await transferProperties(tsconfig, loadTSConfig(process.cwd()));
  await transferProperties(tsconfig, { compilerOptions });
  tsconfig.compilerOptions.incremental = false;
  delete tsconfig.compilerOptions.moduleResolution;
}

export async function resolve(path, cwd) {
  const paths = Object.keys(tsconfig?.compilerOptions?.paths || {});
  for (let i = 0, len = paths?.length || 0; i < len; i++) {
    const cur = paths[i];
    const resolved = tsconfig?.compilerOptions?.paths[cur][0];
    if (cur.endsWith("*")) {
      const regex = cur.slice(0, -1);
      if (new RegExp(`^${regex}.*`).test(path) && resolved.endsWith("*"))
        return path.replace(
          new RegExp(`^${regex}`),
          fs.resolve(cwd, resolved.slice(0, -1)) + "\\",
        );
    } else if (cur === path) return fs.resolve(cwd, resolved);
  }
  return path;
}

export async function load(source) {
  try {
    return await transform(source, {
      format: "esm",
      treeShaking: true,
      loader: "ts",
      tsconfigRaw: {
        compilerOptions: tsconfig.compilerOptions,
      },
      jsx: "preserve",
      sourcemap: false,
      target: "esnext",
    });
  } catch (e) {
    return [e];
  }
}

//

async function loadTSConfig(folder) {
  try {
    return (
      JSON.parse(
        await fs.readFile(fs.resolve(folder, "./tsconfig.json"), "utf-8"),
      ) || {}
    );
  } catch {
    return {};
  }
}

async function transferProperties(target, props) {
  const keys = Object.keys(props || {});
  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i];
    const cur = props[key];
    if (typeof cur === "object") {
      if (Array.isArray(cur) && Array.isArray(target[key]))
        target[key].push(...cur);
      else if (typeof target[key] === "object")
        await transferProperties(target[key], cur);
      else target[key] = cur;
    } else target[key] = cur;
  }
}
