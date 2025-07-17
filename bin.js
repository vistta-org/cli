#!/usr/bin/env node
/* eslint-disable no-control-regex */
"use strict";
import fs from "@vistta/fs";
import { fork, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ENABLED_NODE_OPTIONS, importEnv, importJSON } from "./utils.js";

const dirname = import.meta.dirname;
const cwd = process.cwd();
const rootPackage = await importJSON(fs.resolve(dirname, "package.json"));
const projectPackage = await importJSON(fs.resolve(cwd, "package.json"));
const env = await importEnv(fs.resolve(cwd, ".env"));
const projectEnvKeys = Object.keys(projectPackage?.env || {});
for (let i = 0, len = projectEnvKeys.length; i < len; i++) env[projectEnvKeys[i]] = projectPackage.env[projectEnvKeys[i]];
env.NODE_ENV = "production";
env.CLI_VERSION = rootPackage.version;
env.PROJECT_PATH = cwd;
env.PROJECT_NAME = projectPackage.name;
env.PROJECT_VERSION = projectPackage.version;

if (process.argv[2] === "run") run();
else {
  const argv = [];
  const execArgv = ["--import", pathToFileURL(fs.resolve(dirname, "register.js")), "--experimental-sqlite", "--title=VISTTA"];
  for (let i = 2, len = process.argv.length; i < len; i++) {
    const [arg, value] = process.argv[i].toLowerCase().split("=");
    const nodeOption = ENABLED_NODE_OPTIONS[arg];
    if (nodeOption) {
      if (typeof nodeOption === "string") env[nodeOption] = value || true;
      execArgv.push(arg + "=" + value);
    } else if (arg === "-d" || arg === "--dev") env.NODE_ENV = "development";
    else if (arg === "-h" || arg === "--help") env.NODE_HELP = true;
    else if (arg === "-t" || arg === "--trace") env.NODE_TRACE = true;
    else if (arg === "--debug") env.NODE_DEBUG = true;
    else if (arg === "--silent") env.NODE_SILENT = true;
    else if (arg === "--auto-restart") env.NODE_AUTO_RESTART = true;
    else if (arg === "--crash-report") env.NODE_CRASH_REPORT = true;
    else argv.push(process.argv[i]);
  }
  if (argv.length === 0) env.NODE_HELP = true;
  if (!env.NODE_DEBUG) execArgv.unshift("--no-warnings");
  start(fs.resolve(dirname, "main.js"), argv, {
    env,
    execArgv,
    stdio: env.NODE_SILENT ? "ignore" : "inherit",
  });
}

function run() {
  const [script, ...args] = process.argv.slice(3);
  const child = spawn("node", ["--no-warnings", "--run", script, "--", ...args], { stdio: "inherit", windowsHide: true });
  child.on("close", (code) => process.exit(code));
  process.on("SIGINT", () => !child.killed && child.kill("SIGINT"));
  process.on("SIGTERM", () => !child.killed && child.kill("SIGTERM"));
}

function start(...args) {
  fork(...args).on("exit", (code) => {
    if (env.NODE_AUTO_RESTART && code != 0) start(...args);
    else process.exit(code);
  });
}
