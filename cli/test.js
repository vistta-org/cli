import fs from "@vistta/fs";
import { Console, colors } from "@vistta/console";
import { default as DefaultCLI } from "./default.js";
import assert from 'node:assert';

const cwd = process.cwd();

export default class extends DefaultCLI {
  #results = [];
  #failed;
  #suite;
  #runningCounter = 0;

  constructor(options) {
    super(options);
    this.define("suite", this.suite.bind(this));
    this.define("describe", this.suite.bind(this));
    this.define("test", this.test.bind(this));
    this.define("it", this.test.bind(this));
    this.define("assert", assert);
    if (!process.env.NODE_DEBUG) {
      const writer = new WritableStream({ write() { } }).getWriter();
      this.define("console", new Console({ writer, clear() { } }));
    }
  }

  help() {
    system.log("vistta test [...patterns]");
    system.log("\nUsage:\n");
    system.log("vistta test [...patterns]\tRuns all the tests that match the pattern/s in the current project");
  }

  async main(_, ...patterns) {
    system.announce(`Vistta CLI v${process.env.CLI_VERSION}`);
    if (patterns.length === 0) patterns = ["**/*.test.js", "**/*.test.ts"];
    for (let i = 0, len = patterns.length; i < len; i++)
      patterns[i] = fs.resolve(cwd, patterns[i])
    const entries = fs.glob(patterns);
    let entry = (await entries.next())?.value;
    while (entry) {
      try {
        if (!entry.includes("\\node_modules\\")) await import(fs.resolve(entry));
        await this.#await();
      }
      catch { this.#failed = true; }
      entry = (await entries.next())?.value;
    }
    let output = "";
    for (let i = 0, len = this.#results.length; i < len; i++) {
      const { name, tests } = this.#results[i];
      if (name) output += `\n${name}\n`;
      const [results, passing, total, time] = processTests(tests);
      output += `${results}${passing === total ? colors.green : colors.red}${passing}/${total} passing ${colors.reset + colors.dim}(${time}ms)${colors.reset}\n`
    }
    system.log(output);
    process.exit(this.#failed ? -1 : 0);
  }

  async suite(name, callback) {
    if (this.#suite) throw new Error("Suites/Describes cannot be stacked");
    this.#runningCounter++;
    this.#suite = { name, tests: [] };
    try {
      const value = callback();
      if (value instanceof Promise) await value;
    } catch { /* Do Nothing */ }
    this.#results.push(this.#suite);
    this.#suite = null;
    this.#runningCounter--;
  }

  async test(name, callback) {
    this.#runningCounter++;
    const test = { name };
    const start = performance();
    if (this.#suite) this.#suite.tests.push(test);
    else this.#results.push({ tests: [test], time: test.time });

    try {
      const value = callback();
      if (value instanceof Promise) await value
      test.status = "pass";
      test.time = performance(start);
    } catch (error) {
      test.status = "fail";
      test.error = error;
      test.time = performance(start);
      this.#failed = true;
    }
    this.#runningCounter--;
  }

  #await() {
    return new Promise((resolve) => {
      const timer = () => {
        if (this.#runningCounter === 0) resolve();
        else setTimeout(timer, 500);
      }
      timer();
    });
  }
}

function performance(start) {
  if (!start) return process.hrtime();
  const end = process.hrtime(start);
  return (end[0] * 1000) + (end[1] / 1e6);
}

function processTests(tests) {
  let passing = 0;
  let total = 0;
  let timeAcc = 0;
  let acc = "";
  for (let i = 0, len = tests?.length || 0; i < len; i++) {
    const { name, status, time, error } = tests[i];
    timeAcc += time;
    if (status === "pass") {
      acc += `  ${colors.green}✔  ${name} ${colors.reset + colors.dim}(${time}ms)${colors.reset}\n`;
      passing++;
    }
    else acc += `  ${colors.red}✖  ${name} ${colors.reset + colors.dim}(${time}ms)${colors.reset}\n\t${colors.red + error + colors.reset}\n`;
    total++;
  }
  return [acc, passing, total, timeAcc];
}