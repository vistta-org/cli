/*
import fs from "@vistta/fs";
import { run, describe, it, suite, test, after, afterEach, before, beforeEach } from "node:test";
import assert from "node:assert";

describe.after = after;
suite.after = after;
describe.afterEach = afterEach;
suite.afterEach = afterEach;
describe.before = before;
suite.before = before;
describe.beforeEach = beforeEach;
suite.beforeEach = beforeEach;

global.describe = describe;
global.it = it;
global.suite = suite;
global.test = test;
global.assert = assert;

run({ globPatterns: "", watch: process.env.NODE_WATCH })
  .on("test:enqueue", ({ name, nesting }) => {
    console.log(name, nesting);
  })

const files = [];
const entries = fs.glob(".test.js");
const results = { errors: [], code: 0, stderr: [] };
let entry = (await entries.next())?.value;
while (entry) {
  files.push(fs.resolve(entry));
  entry = (await entries.next())?.value;
}
run({ files, watch: process.env.NODE_WATCH })
  .on("test:enqueue", ({ name, nesting }) => system.log("test:enqueue", name, nesting))
  .on("test:plan", ({ nesting, count }) => system.log("test:plan", nesting, count))
  .on("test:fail", ({ name, nesting, details }) => system.log("test:fail", name, nesting, details))
  .on("test:complete", ({ name, nesting, details }) => system.log("test:complete", name, nesting, details.duration_ms, details.passed))
  .on("test:stderr", ({ message }) => console.error(message))
  .on("test:stdout", ({ message }) => console.log(message))
  .on("test:coverage", (arg) => system.log("test:coverage", Object.keys(arg)));


function diagnostic(message) {
  system.info(message);
  clearTimeout(results.timer);
  results.timer = setTimeout(() => {
    results.errors.forEach((error) => system.error("\n" + error));
    if (results.code === 1)
      results.stderr.forEach((error) => system.error("\n" + error));
    process.exit(results.code);
  }, 250);
}

function report(nesting, name, status, duration, error) {
  let message = "";
  if (nesting === 0) message += status === "start" ? "┌" : "└";
  else message += "├" + "─".repeat(nesting);
  if (status === "fail") (message += console.red), (results.code = 1);
  if (status === "pass") message += console.green;
  message += " " + name;
  if (duration) message += ` ${console.reset + console.dim}(${duration} ms)`;
  if (error) results.errors.push(error);
  if (nesting === 0 && status !== "start") message += "\n";
  return system.log(message);
}
*/