import fs from "@vistta/fs";
import { Console, colors } from "@vistta/console";
import { default as DefaultCLI } from "./default.js";
import { evalCLIString } from "../utils.js";

const cwd = process.cwd();

export default class extends DefaultCLI {
  #options = {};
  #results = [];
  #failed;
  #suite;
  #runningCounter = 0;

  constructor(options) {
    super(options);
    this.env("NODE_ENV", "testing");
    this.define("suite", this.suite.bind(this));
    this.define("test", this.test.bind(this));
    this.define("expect", this.expect.bind(this));
    if (!process.env.NODE_DEBUG) {
      const writer = new WritableStream({ write() { } }).getWriter();
      this.define("console", new Console({ writer, clear() { } }));
    }
  }

  help() {
    system.log("vistta test [...patterns]");
    system.log("\nUsage:\n");
    system.log("vistta test [...patterns]\tRuns all the tests files that match the pattern/s in the current project");
    system.log("vistta test --only=\"pattern\"\tRuns all the tests that match the only pattern/s in the current project");
  }

  async main(_, ...args) {
    let i = 0;
    while (i < args.length) {
      const [option, value] = args[i].toLowerCase().split("=");
      if (option.startsWith("--")) {
        this.#options[option.slice(2)] = evalCLIString(value);
        args.splice(i, 1);
      }
      else i++;
    }
    system.announce(`Vistta CLI v${process.env.CLI_VERSION}`);
    if (args.length === 0) args = ["**/*.test.js", "**/*.test.ts"];
    for (let i = 0, len = args.length; i < len; i++)
      args[i] = fs.resolve(cwd, args[i])
    const entries = fs.glob(args);
    let entry = (await entries.next())?.value;
    while (entry) {
      try {
        process.chdir(fs.dirname(entry));
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
    if (this.#options.only && !name.match(new RegExp(this.#options.only, "i"))) return;
    this.#runningCounter++;
    const test = { name };
    test.start = performance();
    if (this.#suite) this.#suite.tests.push(test);
    else this.#results.push({ tests: [test], time: test.time });

    try {
      const value = callback();
      if (value instanceof Promise) await value
      test.status = "pass";
      test.end = performance();
    } catch (error) {
      test.status = "fail";
      test.error = error;
      test.end = performance();
      this.#failed = true;
    }
    this.#runningCounter--;
  }

  expect(target) {
    return {
      toEqual: (value) => {
        if (target === value) return;
        throw new Error(`expected ${target} to equal ${value}`);
      },
      toInclude: (value) => {
        if (target.indexOf(value) > -1) return;
        throw new Error(`expected ${target} to include ${value}`);
      },
      toMatch: (regex) => {
        if (target.match(new RegExp(regex))) return;
        throw new Error(`expected ${target} to match ${regex}`);
      }
    }
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

function processTests(tests) {
  let passing = 0;
  let total = 0;
  let acc = "";
  let first, last;
  for (let i = 0, len = tests?.length || 0; i < len; i++) {
    const { name, status, start, end, error } = tests[i];
    if (!first || start < first) first = start;
    if (!last || end > last) last = end;
    if (status === "pass") {
      acc += `  ${colors.green}✔  ${name} ${colors.reset + colors.dim}(${Math.round(end - start)}ms)${colors.reset}\n`;
      passing++;
    }
    else acc += `  ${colors.red}✖  ${name} ${colors.reset + colors.dim}(${Math.round(end - start)}ms)${colors.reset}\n\t${colors.red + error + colors.reset}\n`;
    total++;
  }
  return [acc, passing, total, Math.round(last - first)];
}

function performance(time = process.hrtime()) {
  return (time[0] * 1000) + (time[1] / 1e6);
}