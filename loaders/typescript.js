import fs from "@vistta/fs";
import { transform } from "esbuild";

export const tsconfig = { compilerOptions: {} };

export async function initialize(compilerOptions) {
  await transferProperties(
    tsconfig,
    await loadTSConfig(fs.resolve(import.meta.dirname, "../"))
  );
  await transferProperties(tsconfig, await loadTSConfig(process.cwd()));
  await transferProperties(tsconfig, { compilerOptions });
  tsconfig.compilerOptions.incremental = false;
  delete tsconfig.compilerOptions.moduleResolution;
  return tsconfig.compilerOptions;
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
    return { errors: [e] };
  }
}

//

async function loadTSConfig(folder) {
  try {
    return (
      JSON.parse(
        await fs.readFile(fs.resolve(folder, "./tsconfig.json"), "utf-8")
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
