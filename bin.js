#!/usr/bin/env node
"use strict";
import { fs, importEnv, importJSON } from "./utils.js";
import { pathToFileURL } from "node:url";
import { fork } from "node:child_process";

const dirname = fs.dirname(import.meta.url);
const cwd = process.cwd();
const rootPackage = await importJSON(fs.resolve(dirname, "package.json"));
const projectPackage = await importJSON(fs.resolve(cwd, "package.json"));
const env = await importEnv(fs.resolve(cwd, ".env"));
const projectEnvKeys = Object.keys(projectPackage?.env || {});
for (let i = 0, len = projectEnvKeys.length; i < len; i++)
  env[projectEnvKeys[i]] = projectPackage.env[projectEnvKeys[i]];
env.CLI_VERSION = rootPackage.version;
env.PROJECT_NAME = projectPackage.name;
env.PROJECT_VERSION = projectPackage.version;
const argv = [];
const execArgv = [
  "--import",
  pathToFileURL(fs.resolve(dirname, "register.js")),
];
for (let i = 2, len = process.argv.length; i < len; i++) {
  const arg = process.argv[i].toLowerCase();
  if (arg === "-d" || arg === "--dev") env.NODE_ENV = "development";
  else if (arg === "-h" || arg === "--help") env.NODE_HELP = true;
  else if (arg === "-w" || arg === "--watch") {
    env.NODE_WATCH = true;
    execArgv.push("--watch");
  } else if (arg === "-t" || arg === "--trace") env.NODE_TRACE = true;
  else if (arg === "--debug") env.NODE_DEBUG = true;
  else if (arg === "--ci") env.CI = true;
  else if (arg.startsWith("-")) argv.push(execArgv);
  else argv.push(arg);
}
if (argv.length === 0) env.NODE_HELP = true;
if (!env.NODE_DEBUG) execArgv.unshift("--no-warnings");
fork(fs.resolve(dirname, "main.js"), argv, {
  env,
  execArgv,
  stdio: "inherit",
}).on("exit", (code) => process.exit(code));