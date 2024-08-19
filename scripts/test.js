import fs from "@vistta/fs";
import { run } from "node:test";

const files = [];
const entries = fs.glob("**/*.test.js");
const results = { errors: [], code: 0, stderr: [] };
let entry = (await entries.next())?.value;
while (entry) {
  files.push(fs.resolve(entry));
  entry = (await entries.next())?.value;
}
run({ files, watch: process.env.NODE_WATCH })
  .on("test:enqueue", ({ name, nesting }) => {
    if (nesting !== 0 || files.indexOf(name) != -1) return;
    report(nesting, name, "start");
  })
  .on("test:fail", ({ name, nesting, details: { duration_ms, error, ...rest } }) =>
    (report(nesting, name, "fail", duration_ms, error), system.error(error, rest)),
  )
  .on("test:pass", ({ name, nesting, details: { duration_ms } }) =>
    report(nesting, name, "pass", duration_ms),
  )
  .on(
    "test:diagnostic",
    ({ message }) => system.log("here"),
  )
  .on("test:coverage", (...args) => console.debug("test:coverage", ...args));

//

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
