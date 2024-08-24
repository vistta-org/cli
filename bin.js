#!/usr/bin/env node
"use strict";
import { dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { load as loadEnv } from "./loaders/env.js";
import { load as loadPackage } from "./loaders/package.js";
import { fork } from "node:child_process";

const pkg = await loadPackage();
const env = await loadEnv(
  pkg?.vistta || {},
  pkg?.name || "",
  pkg?.version || "",
);
env.MAIN = process.argv[2];
const args = [];
const execArgv = ["--import", root("register.js")];
for (let i = 3, len = process.argv.length; i < len; i++) {
  const arg = process.argv[i].toLowerCase();
  if (arg === "-d" || arg === "--dev") env.NODE_ENV = "development";
  else if (arg === "-w" || arg === "--watch") {
    env.NODE_WATCH = true;
    execArgv.push("--watch");
  } else if (arg === "-t" || arg === "--trace") env.NODE_TRACE = true;
  else if (arg === "--debug") env.NODE_DEBUG = true;
  else if (arg === "--ci") env.CI = true;
  else if (arg.startsWith("-")) args.push(execArgv);
  else args.push(arg);
}
if (env.MAIN === "test") env.NODE_ENV = "test";
fork(pkg.vistta.scripts?.[env.MAIN] || pkg.vistta.scripts.default, args, {
  env,
  execArgv,
  stdio: "inherit",
}).on("exit", (code) => process.exit(code));

function root(filepath) {
  return pathToFileURL(
    resolve(dirname(fileURLToPath(import.meta.url)), filepath),
  );
}
