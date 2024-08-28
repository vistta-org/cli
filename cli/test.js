import { default as DefaultCLI } from "./default.js";
import assert from 'node:assert';
import fs from "@vistta/fs";

export default class extends DefaultCLI {
  #suite;
  #results = [];
  #failed;

  constructor(options) {
    super(options);
    this.define("suite", this.suite.bind(this));
    this.define("describe", this.suite.bind(this));
    this.define("test", this.test.bind(this));
    this.define("it", this.test.bind(this));
    this.define("assert", assert);
  }

  async main(_, pattern = "**/*.test.js") {
    if (!process.env.NODE_DEBUG) console.disable();
    const entries = fs.glob(fs.resolve(process.cwd(), pattern));
    let entry = (await entries.next())?.value;
    while (entry) {
      try {
        if (!entry.includes("\\node_modules\\")) await import(fs.resolve(entry));
      }
      catch { this.#failed = true; }
      entry = (await entries.next())?.value;
    }
    let output = "";
    for (let i = 0, len = this.#results.length; i < len; i++) {
      const { name, tests, time } = this.#results[i];
      if (name) output += `\n${name}\n`;
      const [results, passing, total] = processTests(tests);
      output += `${results}${passing === total ? console.green : console.red}${passing}/${total} passing ${console.reset + console.dim}(${time}ms)${console.reset}\n`
    }
    system.log(output);
    process.exit(this.#failed ? -1 : 0);
  }

  async suite(name, callback) {
    if (this.#suite) throw new Error("Suites/Describes cannot be stacked");
    this.#suite = { name, tests: [] };
    const start = performance();
    try {
      const value = callback();
      if (value instanceof Promise)
        value.then(() => this.#suite.time = performance(start))
          .catch(() => this.#suite.time = performance(start));
      else this.#suite.time = performance(start)
    } catch {
      this.#suite.time = performance(start)
    }
    this.#results.push(this.#suite);
    this.#suite = null;
  }

  async test(name, callback) {
    const test = { name };
    const start = performance();
    try {
      const value = callback();
      if (value instanceof Promise) value.then(() => {
        test.status = "pass";
        test.time = performance(start);
      }).catch((error) => {
        test.status = "fail";
        test.error = error;
        test.time = performance(start);
        this.#failed = true;
      });
      else {
        test.status = "pass";
        test.time = performance(start);
      }
    } catch (error) {
      test.status = "fail";
      test.error = error;
      test.time = performance(start);
      this.#failed = true;
    }
    if (this.#suite) this.#suite.tests.push(test);
    else this.#results.push({ tests: [test], time: test.time });
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
  let acc = "";
  for (let i = 0, len = tests?.length || 0; i < len; i++) {
    const { name, status, time, error } = tests[i];
    if (status === "pass") {
      acc += `  ${console.green}✔  ${name} ${console.reset + console.dim}(${time}ms)${console.reset}\n`;
      passing++;
    }
    else acc += `  ${console.red}✖  ${name} ${console.reset + console.dim}(${time}ms)${console.reset}\n\t${console.red + error + console.reset}\n`;
    total++;
  }
  return [acc, passing, total];
}