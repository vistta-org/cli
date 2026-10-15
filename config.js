import { parse, printParseErrorCode } from "jsonc-parser";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function mergeConfig(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    result[key] = value && typeof value === "object" && !Array.isArray(value) ? mergeConfig(result[key], value) : value;
  }
  return result;
}

export function loadProjectConfig(directory = process.cwd()) {
  const file = ["tsconfig.json", "jsconfig.json"].map((name) => resolve(directory, name)).find(existsSync);
  if (!file) return { file: undefined, config: {}, sources: {} };
  const active = new Set();
  const sources = {};
  function load(filepath) {
    if (active.has(filepath)) throw new Error(`Circular configuration inheritance: ${filepath}`);
    active.add(filepath);
    const errors = [];
    const own = parse(readFileSync(filepath, "utf8"), errors, { allowTrailingComma: true });
    if (errors.length) throw new Error(`Invalid configuration ${filepath}: ${printParseErrorCode(errors[0].error)}`);
    if (!own || typeof own !== "object" || Array.isArray(own))
      throw new Error(`Expected a configuration object in ${filepath}`);
    for (const name of ["cli", "cliOptions"]) {
      if (own[name] !== undefined && (!own[name] || typeof own[name] !== "object" || Array.isArray(own[name])))
        throw new Error(`${name} must be an object in ${filepath}`);
    }
    let inherited = {};
    for (const parent of own.extends ? (Array.isArray(own.extends) ? own.extends : [own.extends]) : []) {
      if (typeof parent !== "string") throw new Error(`Expected a string in extends in ${filepath}`);
      const base = dirname(filepath);
      let parentFile;
      if (parent.startsWith(".") || isAbsolute(parent)) {
        parentFile = resolve(base, parent);
        if (!existsSync(parentFile) && existsSync(parentFile + ".json")) parentFile += ".json";
      } else parentFile = createRequire(filepath).resolve(parent);
      inherited = mergeConfig(inherited, load(parentFile));
    }
    const cli = mergeConfig(own.cliOptions, own.cli || {});
    if (cli.commands !== undefined && (!cli.commands || typeof cli.commands !== "object" || Array.isArray(cli.commands)))
      throw new Error(`cli.commands must be an object in ${filepath}`);
    for (const [name, value] of Object.entries(cli.commands || {})) {
      if (typeof value !== "string") throw new Error(`Expected a module path for cli.commands.${name} in ${filepath}`);
      cli.commands[name] =
        value.startsWith(".") || isAbsolute(value)
          ? pathToFileURL(resolve(dirname(filepath), value)).href
          : pathToFileURL(createRequire(filepath).resolve(value)).href;
    }
    for (const section of ["lint", "format"]) {
      if (cli[section]?.config !== undefined && typeof cli[section].config !== "string")
        throw new Error(`cli.${section}.config must be a module path in ${filepath}`);
      if (typeof cli[section]?.config === "string") {
        const value = cli[section].config;
        cli[section].config =
          value.startsWith(".") || isAbsolute(value)
            ? pathToFileURL(resolve(dirname(filepath), value)).href
            : pathToFileURL(createRequire(filepath).resolve(value)).href;
      }
    }
    const normalized = { ...own, cli };
    delete normalized.extends;
    delete normalized.cliOptions;
    function record(value, prefix = "") {
      for (const [key, entry] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (entry && typeof entry === "object" && !Array.isArray(entry)) record(entry, path);
        else sources[path] = filepath;
      }
    }
    record(normalized);
    active.delete(filepath);
    return mergeConfig(inherited, normalized);
  }
  const config = load(file);
  function stringList(value, path) {
    if (value !== undefined && (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")))
      throw new Error(`${path} must be an array of strings in ${file}`);
  }
  for (const name of ["include", "exclude", "files"]) stringList(config[name], name);
  for (const section of ["check", "lint", "format", "tasks"]) {
    const value = config.cli?.[section];
    if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value)))
      throw new Error(`cli.${section} must be an object in ${file}`);
  }
  for (const [name, value] of Object.entries(config.cli?.check || {})) {
    if (!["format", "lint", "types"].includes(name) || typeof value !== "boolean")
      throw new Error(`cli.check.${name} must be a boolean check named format, lint, or types`);
  }
  for (const section of ["lint", "format"]) {
    const options = config.cli?.[section] || {};
    const engine = options.engine;
    const expected = section === "lint" ? "eslint" : "prettier";
    if (engine !== undefined && engine !== expected) throw new Error(`cli.${section}.engine must be "${expected}"`);
    for (const name of ["include", "exclude"]) stringList(options[name], `cli.${section}.${name}`);
    for (const name of section === "lint" ? ["rules", "languageOptions", "options"] : ["options"]) {
      const value = options[name];
      if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value)))
        throw new Error(`cli.${section}.${name} must be an object in ${file}`);
    }
    for (const name of Object.keys(options)) {
      if (
        ![
          "engine",
          "include",
          "exclude",
          "options",
          "config",
          ...(section === "lint" ? ["rules", "languageOptions"] : []),
        ].includes(name)
      )
        throw new Error(`Unknown setting cli.${section}.${name} in ${file}`);
    }
  }
  for (const [name, task] of Object.entries(config.cli?.tasks || {})) {
    if (!task || typeof task !== "object" || Array.isArray(task)) throw new Error(`cli.tasks.${name} must be an object`);
    stringList(task.dependsOn, `cli.tasks.${name}.dependsOn`);
    if (task.script !== undefined && typeof task.script !== "string")
      throw new Error(`cli.tasks.${name}.script must be a package script name`);
    for (const key of Object.keys(task))
      if (!["dependsOn", "script"].includes(key)) throw new Error(`Unknown setting cli.tasks.${name}.${key}`);
  }
  return { file, config, sources };
}
