import { spawn } from "node:child_process";
import { existsSync, globSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, matchesGlob, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { loadProjectConfig, mergeConfig } from "./config.js";

function projectToolPath(name, cwd) {
  const require = createRequire(resolve(cwd, "package.json"));
  let entry;
  try {
    entry = require.resolve(name);
  } catch (error) {
    if (
      error.code !== "MODULE_NOT_FOUND" ||
      require.resolve.paths(name)?.some((path) => existsSync(resolve(path, name, "package.json")))
    )
      throw error;
    try {
      entry = createRequire(import.meta.url).resolve(name);
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
      throw new Error(`Missing tool "${name}". Reinstall @vistta/cli or install it locally: npm install --save-dev ${name}`);
    }
  }
  return entry;
}

export async function projectTool(name, cwd) {
  const module = await import(pathToFileURL(projectToolPath(name, cwd)).href);
  return module.default || module;
}

function excludedFiles(project, name, cwd) {
  const section = project.config.cli?.[name] || {};
  const excluded = ["**/node_modules", "**/node_modules/**", "**/.git", "**/.git/**"];
  for (const pattern of section.exclude || project.config.exclude || []) {
    const source = project.sources[`cli.${name}.exclude`] || project.sources.exclude || project.file;
    const path = resolve(source ? dirname(source) : cwd, pattern).replaceAll("\\", "/");
    excluded.push(path, path + "/**");
  }
  const output = project.config.compilerOptions?.outDir;
  if (output) {
    const source = project.sources["compilerOptions.outDir"] || project.file;
    excluded.push(resolve(source ? dirname(source) : cwd, output).replaceAll("\\", "/") + "/**");
  }
  return (entry, directory = false) => {
    const path = resolve(cwd, entry).replaceAll("\\", "/");
    return (
      path.split("/").some((part) => part === "node_modules" || part === ".git") ||
      excluded.some((pattern) => matchesGlob(path, pattern) || (directory && matchesGlob(path + "/", pattern)))
    );
  };
}

function contains(directory, file) {
  const path = relative(directory, file);
  return path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path);
}

function checkProjects(project, cwd) {
  const projects = [{ project, cwd, parents: [] }];
  function visit(directory, current) {
    const excluded = excludedFiles(current.project, undefined, current.cwd);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = resolve(directory, entry.name);
      if (excluded(path, true)) continue;
      let next = current;
      if (["tsconfig.json", "jsconfig.json"].some((name) => existsSync(resolve(path, name)))) {
        const local = loadProjectConfig(path);
        next = {
          project: {
            ...local,
            config: mergeConfig(current.project.config, local.config),
            sources: { ...current.project.sources, ...local.sources },
          },
          cwd: path,
          parents: [...current.parents, current],
        };
        projects.push(next);
      }
      visit(path, next);
    }
  }
  visit(cwd, projects[0]);
  return projects;
}

/** @param {(path: string) => boolean} [inScope] */
export function toolFiles(project, name, patterns = [], cwd = process.cwd(), inScope = () => true) {
  const section = project.config.cli?.[name] || {};
  const explicit = patterns.length > 0;
  const source = project.sources[`cli.${name}.include`] || project.sources.include || project.file;
  const base = explicit ? cwd : source ? dirname(source) : cwd;
  const defaults = name === "lint" ? ["**/*.{js,jsx,mjs,cjs,ts,tsx}"] : ["**/*"];
  const include = explicit ? patterns : section.include || project.config.include || (project.config.files ? [] : defaults);
  const isExcluded = excludedFiles(project, name, cwd);
  const files = globSync(
    include.map((pattern) => resolve(base, pattern).replaceAll("\\", "/")),
    {
      cwd: base,
      exclude: (entry) => {
        if (!isAbsolute(entry)) return entry.split(/[\\/]/).some((part) => part === "node_modules" || part === ".git");
        return isExcluded(entry) || !inScope(entry);
      },
    },
  );
  if (!explicit && !section.include) {
    for (const file of project.config.files || []) files.push(resolve(dirname(project.sources.files || project.file), file));
  }
  return [...new Set(files)].filter((file) => inScope(file) && !isExcluded(file) && statSync(file).isFile()).sort();
}

async function lint(project, selected, fix, cwd) {
  const section = project.config.cli?.lint || {};
  const { ESLint } = await projectTool("eslint", cwd);
  const require = createRequire(projectToolPath("eslint", cwd));
  const recommended = require("@eslint/js").configs.recommended;
  const { FlatCompat } = require("@eslint/eslintrc");
  const environments = section.env ? new FlatCompat({ baseDirectory: cwd }).env(section.env) : [];
  const external = section.config ? (await import(section.config)).default : undefined;
  const inline = section.rules || section.languageOptions || section.options || section.env;
  const languageOptions = { ...section.languageOptions };
  if (typeof languageOptions.parser === "string") languageOptions.parser = await projectTool(languageOptions.parser, cwd);
  const override = {
    ...section.options,
    ...(section.rules ? { rules: section.rules } : {}),
    ...(section.languageOptions ? { languageOptions } : {}),
  };
  const probe = new ESLint({ cwd });
  const hasConfig = await probe.findConfigFile();
  const eslint = new ESLint({
    cwd,
    fix,
    overrideConfig: [
      ...(!external && !hasConfig
        ? [
            {
              files: ["**/*.{js,jsx,mjs,cjs}"],
              ...recommended,
              languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
              plugins: {
                vistta: {
                  rules: {
                    "jsx-uses-vars": {
                      create(context) {
                        return {
                          JSXOpeningElement(node) {
                            let name = node.name;
                            while (name.type === "JSXMemberExpression") name = name.object;
                            if (
                              name.type === "JSXIdentifier" &&
                              (node.name.type === "JSXMemberExpression" || /^[A-Z_$]/.test(name.name))
                            )
                              context.sourceCode.markVariableAsUsed(name.name, node);
                          },
                        };
                      },
                    },
                  },
                },
              },
              rules: { ...recommended.rules, "vistta/jsx-uses-vars": "error" },
            },
          ]
        : []),
      ...environments,
      ...(external ? (Array.isArray(external) ? external : [external]) : []),
      ...(inline ? [override] : []),
    ],
    ...(external || !hasConfig ? { overrideConfigFile: true } : {}),
  });
  const files = [];
  for (const file of selected) if (!(await eslint.isPathIgnored(file))) files.push(file);
  if (!files.length) return 0;
  const results = await eslint.lintFiles(files);
  if (fix) await ESLint.outputFixes(results);
  const formatted = await (await eslint.loadFormatter("stylish")).format(results);
  if (formatted) console.log(formatted);
  return results.some((result) => result.errorCount || result.warningCount) ? 1 : 0;
}

async function format(project, files, write, cwd) {
  const prettier = await projectTool("prettier", cwd);
  const section = project.config.cli?.format || {};
  const external = section.config ? (await import(section.config)).default : undefined;
  let failed = false;
  const ignorePath = resolve(cwd, ".prettierignore");
  for (const file of files) {
    const info = await prettier.getFileInfo(file, {
      ...(existsSync(ignorePath) ? { ignorePath } : {}),
      withNodeModules: false,
    });
    if (info.ignored || !info.inferredParser) continue;
    const options = {
      endOfLine: "auto",
      ...(external || (await prettier.resolveConfig(file))),
      ...section.options,
      filepath: file,
    };
    const original = readFileSync(file, "utf8");
    const formatted = await prettier.format(original, options);
    const output = original.endsWith("\n") ? formatted : formatted.replace(/\r?\n$/, "");
    if (original === output) continue;
    if (write) writeFileSync(file, output);
    else failed = true;
    console.log(`${write ? "Formatted" : "Needs formatting"}: ${file}`);
  }
  return failed ? 1 : 0;
}

function warnReincluded(files, entry, name) {
  for (const parent of entry.parents) {
    const excluded = excludedFiles(parent.project, name, parent.cwd);
    const reincluded = files.filter((file) => excluded(file));
    if (reincluded.length)
      console.warn(
        `${name} (${entry.cwd}): child configuration selects ${reincluded.length} file(s) excluded by ${parent.project.file}; using child settings (for example ${reincluded[0]})`,
      );
  }
}

export async function checkTypes(entry, directories) {
  const { project, cwd } = entry;
  const ts = await projectTool("typescript", cwd);
  const diagnostics = [];
  const host = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (error) => diagnostics.push(error) };
  const defaults = project.file
    ? {}
    : loadProjectConfig(fileURLToPath(new URL(".", import.meta.url))).config.compilerOptions;
  const convertedDefaults = ts.convertCompilerOptionsFromJson(defaults, cwd, project.file);
  diagnostics.push(...convertedDefaults.errors);
  const options = convertedDefaults.options;
  for (const [name, value] of Object.entries(project.config.compilerOptions || {})) {
    const key = `compilerOptions.${name}`;
    const source =
      project.sources[key] ||
      Object.entries(project.sources).find(([path]) => path.startsWith(key + "."))?.[1] ||
      project.file;
    const converted = ts.convertCompilerOptionsFromJson({ [name]: value }, dirname(source));
    diagnostics.push(...converted.errors);
    Object.assign(options, converted.options);
  }
  for (const [name, paths] of Object.entries(options.paths || {})) {
    if (Array.isArray(paths) && paths.every((path) => typeof path === "string")) {
      const base = options.baseUrl || dirname(project.sources[`compilerOptions.paths.${name}`] || project.file);
      options.paths[name] = paths.map((path) => resolve(base, path).replaceAll("\\", "/"));
    }
  }
  const config = project.file
    ? { ...project.config }
    : { ...project.config, exclude: ["**/node_modules", "**/.git", "**/dist", "**/build", "**/coverage"] };
  delete config.compilerOptions;
  for (const name of ["include", "exclude", "files"]) {
    if (config[name]) {
      const source = project.sources[name] || project.file;
      config[name] = config[name].map((path) => resolve(source ? dirname(source) : cwd, path).replaceAll("\\", "/"));
    }
  }
  if (config.references)
    config.references = config.references.map((reference) => ({
      ...reference,
      path: resolve(dirname(project.sources.references || project.file), reference.path),
    }));
  const parsed = ts.parseJsonConfigFileContent(config, host, cwd, { ...options, noEmit: true }, project.file);
  let skipped = false;
  if (parsed) {
    diagnostics.push(...parsed.errors);
    if (!diagnostics.length) {
      const files = parsed.fileNames.filter((file) => directories.find((directory) => contains(directory, file)) === cwd);
      if (!files.length) {
        const delegated =
          parsed.fileNames.length > 0 &&
          parsed.fileNames.every(
            (file) => contains(cwd, file) && directories.some((directory) => directory !== cwd && contains(directory, file)),
          );
        const solution = config.files?.length === 0 && parsed.fileNames.length === 0;
        if (!delegated && !solution)
          throw new Error(
            `No type-check inputs belong to ${cwd}. Includes/files from ${project.sources.include || project.sources.files || project.file} select files outside this project. Set include or files in ${project.file} to select this project's sources.`,
          );
        skipped = true;
      }
      warnReincluded(files, entry, "types");
      const program = ts.createProgram({
        rootNames: files,
        options: parsed.options,
        projectReferences: parsed.projectReferences,
      });
      diagnostics.push(...ts.getPreEmitDiagnostics(program));
    }
  }
  if (diagnostics.length)
    console.log(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => cwd,
        getNewLine: () => "\n",
      }),
    );
  const code = diagnostics.some((error) => error.category === ts.DiagnosticCategory.Error) ? 1 : 0;
  return { code, skipped: skipped && code === 0 };
}

function types(entry, directories) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./type-check.js", import.meta.url), {
      execArgv: [],
      workerData: { entry, directories },
    });
    /** @type {{ code: number, skipped: boolean } | undefined} */
    let result;
    worker.once("message", (message) => {
      result = message;
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code) reject(new Error(`Type checker exited with code ${code}`));
      else if (!result || ![0, 1].includes(result.code) || typeof result.skipped !== "boolean")
        reject(new Error("Type checker exited without a valid result"));
      else resolve(result);
    });
  });
}

export async function runChecks(names, project, { patterns = [], fix = false, cwd = process.cwd(), check = false } = {}) {
  const results = [];
  const runners = { format, lint, types };
  cwd = resolve(cwd);
  const projects = checkProjects(project, cwd);
  const owners = [...projects].sort((a, b) => b.cwd.length - a.cwd.length);
  const absolutePatterns = patterns.map((pattern) => resolve(cwd, pattern).replaceAll("\\", "/"));
  for (const name of names) {
    for (const entry of projects) {
      if (check && entry.project.config.cli?.check?.[name] === false) continue;
      const owns = (file) => owners.find((owner) => contains(owner.cwd, file)) === entry;
      const label = projects.length > 1 ? `${name} (${relative(cwd, entry.cwd) || "."})` : name;
      try {
        let code;
        let skipped = false;
        if (name === "types")
          ({ code, skipped } = await types(
            entry,
            owners.map((owner) => owner.cwd),
          ));
        else {
          const files = toolFiles(
            entry.project,
            name,
            absolutePatterns,
            entry.cwd,
            (path) => contains(path, entry.cwd) || owns(path),
          ).filter(owns);
          warnReincluded(files, entry, name);
          code = await runners[name](entry.project, files, fix, entry.cwd);
        }
        results.push({ name: label, code, skipped });
        console.log(`${label}: ${skipped ? "skipped (no direct inputs)" : code ? "failed" : "passed"}`);
      } catch (error) {
        results.push({ name: label, code: 1 });
        console.error(`${label}: ${error.message}`);
      }
    }
  }
  const checked = results.filter((result) => !result.skipped);
  const skipped = results.length - checked.length;
  console.log(
    `Checks: ${checked.filter((result) => !result.code).length}/${checked.length} passed${skipped ? ` (${skipped} skipped)` : ""}`,
  );
  return results.some((result) => result.code) ? 1 : 0;
}

export function planTasks(name, tasks = {}, scripts = {}, commands = ["check", "lint", "fmt", "types", "test", "bundle"]) {
  const result = [];
  const visited = new Set();
  const active = new Set();
  function visit(name) {
    if (active.has(name)) throw new Error(`Circular task dependency: ${[...active, name].join(" -> ")}`);
    if (visited.has(name)) return;
    const task = Object.hasOwn(tasks, name) ? tasks[name] : undefined;
    if (!task && !Object.hasOwn(scripts, name) && !commands.includes(name))
      throw new Error(`Unknown task or package script "${name}"`);
    active.add(name);
    for (const dependency of task?.dependsOn || []) visit(dependency);
    active.delete(name);
    visited.add(name);
    if (task?.script && !Object.hasOwn(scripts, task.script))
      throw new Error(`Unknown package script "${task.script}" for task "${name}"`);
    result.push({
      name,
      ...(task ? { script: task.script } : Object.hasOwn(scripts, name) ? { script: name } : { command: name }),
    });
  }
  visit(name);
  return result;
}

export function executeNode(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: "inherit", windowsHide: true });
    const stop = () => child.kill("SIGINT");
    process.on("SIGINT", stop);
    child.on("error", (error) => {
      process.removeListener("SIGINT", stop);
      reject(error);
    });
    child.on("close", (code) => {
      process.removeListener("SIGINT", stop);
      resolve(code ?? 1);
    });
  });
}

export async function runTasks(plan, cwd, args = [], execute = executeNode) {
  const bin = fileURLToPath(new URL("./bin.js", import.meta.url));
  for (const task of plan) {
    if (!task.script && !task.command) continue;
    console.log(`Task: ${task.name}`);
    const forwarded = task === plan.at(-1) ? args : [];
    const code = await execute(
      task.script
        ? ["--run", task.script, ...(forwarded.length ? ["--", ...forwarded] : [])]
        : [bin, task.command, ...forwarded],
      cwd,
    );
    if (code) return code;
  }
  return 0;
}
