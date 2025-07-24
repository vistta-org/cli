import { Bundler } from "../classes/bundler.js";
import { remove } from "../utils.js";

export async function load(_, { path, ...options }) {
  options.write = false;
  remove(options, "type", "extension");
  const { code, files, resources, errors, warnings } = await new Bundler(this).run(path, options);
  return {
    code:
      `export const code = ${JSON.stringify(code)}; ` +
      `export const files = ${JSON.stringify(files)}; ` +
      `export const resources = ${JSON.stringify(resources)}; ` +
      `export const errors = ${JSON.stringify(errors)}; ` +
      `export const warnings = ${JSON.stringify(warnings)};`,
    resources: resources,
  };
}
