import fs from "@vistta/fs";

export async function load(vistta, packageName, packageVersion) {
  const env = vistta?.env || {};
  env.NODE_NO_WARNINGS = 0;
  env.VISTTA_LOADERS = JSON.stringify(vistta?.loaders || {});
  env.VISTTA_DEFAULT_EXTENSIONS = JSON.stringify(vistta?.defaultExtensions || []);
  env.VISTTA_COMPILER_OPTIONS = JSON.stringify(vistta?.compilerOptions || {});
  env.VISTTA_BUNDLER_OPTIONS = JSON.stringify(vistta?.bundlerOptions || {});
  env.PACKAGE_NAME = packageName;
  env.PACKAGE_VERSION = packageVersion;
  if (!fs.existsSync(".env")) return env;
  for (let entry of (await fs.readFile(".env", "utf8")).split("\n")) {
    const [key, value] = entry.split("=");
    env[key] = value;
  }
  return env;
}
