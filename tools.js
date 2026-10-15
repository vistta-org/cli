import { spawn } from "node:child_process";
import { existsSync, globSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, matchesGlob, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function projectTool(name, cwd) {
  const require = createRequire(resolve(cwd, "package.json"));
  let entry;
  try {
    entry = require.resolve(name);
  } catch {
    throw new Error(`Missing project tool "${name}". Install it locally: npm install --save-dev ${name}`);
  }
  const module = await import(pathToFileURL(entry).href);
  return module.default || module;
}

export function toolFiles(project, name, patterns = [], cwd = process.cwd()) {
  const section = project.config.cli?.[name] || {};
  const explicit = patterns.length > 0;
  const source = project.sources[`cli.${name}.include`] || project.sources.include || project.file;
  const base = explicit ? cwd : source ? dirname(source) : cwd;
  const defaults = name === "lint" ? ["**/*.{js,jsx,mjs,cjs,ts,tsx}"] : ["**/*"];
  const include = explicit ? patterns : section.include || project.config.include || (project.config.files ? [] : defaults);
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
  const files = globSync(
    include.map((pattern) => resolve(base, pattern).replaceAll("\\", "/")),
    {
      cwd: base,
      exclude: (entry) => {
        const path = resolve(base, entry).replaceAll("\\", "/");
        return (
          path.split("/").some((part) => part === "node_modules" || part === ".git") ||
          excluded.some((pattern) => matchesGlob(path, pattern))
        );
      },
    },
  );
  if (!explicit && !section.include) {
    for (const file of project.config.files || []) files.push(resolve(dirname(project.sources.files || project.file), file));
  }
  return [...new Set(files)]
    .filter(
      (file) => !file.split(/[\\/]/).some((part) => part === "node_modules" || part === ".git") && statSync(file).isFile(),
    )
    .sort();
}

async function lint(project, patterns, fix, cwd) {
  const section = project.config.cli?.lint || {};
  const { ESLint } = await projectTool("eslint", cwd);
  const external = section.config ? (await import(section.config)).default : undefined;
  const inline = section.rules || section.languageOptions || section.options;
  const override = {
    ...section.options,
    ...(section.rules ? { rules: section.rules } : {}),
    ...(section.languageOptions ? { languageOptions: section.languageOptions } : {}),
  };
  const probe = new ESLint({ cwd });
  const hasConfig = await probe.findConfigFile();
  const eslint = new ESLint({
    cwd,
    fix,
    ...(external || inline
      ? { overrideConfig: [...(external ? (Array.isArray(external) ? external : [external]) : []), override] }
      : {}),
    ...(external || (!hasConfig && inline) ? { overrideConfigFile: true } : {}),
  });
  const files = [];
  for (const file of toolFiles(project, "lint", patterns, cwd)) if (!(await eslint.isPathIgnored(file))) files.push(file);
  if (!files.length) return 0;
  const results = await eslint.lintFiles(files);
  if (fix) await ESLint.outputFixes(results);
  const formatted = await (await eslint.loadFormatter("stylish")).format(results);
  if (formatted) console.log(formatted);
  return results.some((result) => result.errorCount || result.warningCount) ? 1 : 0;
}

async function format(project, patterns, write, cwd) {
  const prettier = await projectTool("prettier", cwd);
  const section = project.config.cli?.format || {};
  const external = section.config ? (await import(section.config)).default : undefined;
  let failed = false;
  const ignorePath = resolve(cwd, ".prettierignore");
  for (const file of toolFiles(project, "format", patterns, cwd)) {
    const info = await prettier.getFileInfo(file, {
      ...(existsSync(ignorePath) ? { ignorePath } : {}),
      withNodeModules: false,
    });
    if (info.ignored || !info.inferredParser) continue;
    const options = { ...(external || (await prettier.resolveConfig(file))), ...section.options, filepath: file };
    const original = readFileSync(file, "utf8");
    if (await prettier.check(original, options)) continue;
    if (write) writeFileSync(file, await prettier.format(original, options));
    else failed = true;
    console.log(`${write ? "Formatted" : "Needs formatting"}: ${file}`);
  }
  return failed ? 1 : 0;
}

async function types(project, cwd) {
  if (!project.file) throw new Error("Type checking requires tsconfig.json or jsconfig.json");
  const ts = await projectTool("typescript", cwd);
  const diagnostics = [];
  const host = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (error) => diagnostics.push(error) };
  const parsed = ts.getParsedCommandLineOfConfigFile(project.file, { noEmit: true }, host);
  if (parsed) {
    diagnostics.push(...parsed.errors);
    if (!parsed.errors.length) {
      const program = ts.createProgram({
        rootNames: parsed.fileNames,
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
  return diagnostics.some((error) => error.category === ts.DiagnosticCategory.Error) ? 1 : 0;
}

export async function runChecks(names, project, { patterns = [], fix = false, cwd = process.cwd() } = {}) {
  const results = [];
  const runners = { format, lint, types };
  for (const name of names) {
    try {
      const code = name === "types" ? await types(project, cwd) : await runners[name](project, patterns, fix, cwd);
      results.push({ name, code });
      console.log(`${name}: ${code ? "failed" : "passed"}`);
    } catch (error) {
      results.push({ name, code: 1 });
      console.error(`${name}: ${error.message}`);
    }
  }
  console.log(`Checks: ${results.filter((result) => !result.code).length}/${results.length} passed`);
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
