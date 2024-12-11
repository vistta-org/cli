import fs from "@vistta/fs";
import { COLORS } from "@vistta/console";
import { default as DefaultCLI } from "./default.js";

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
    const suite = this.suite.bind(this, false);
    suite.only = this.suite.bind(this, true);
    this.define("suite", suite);
    const test = this.test.bind(this, false);
    test.only = this.test.bind(this, true);
    this.define("test", test);
    this.define("expect", this.expect.bind(this));
  }

  help() {
    console.print("Runs all the tests files that match the pattern/s in the current project");
    console.print("\nUsage:");
    console.print("vistta test [...patterns]\tRuns all the tests files that match the pattern/s in the current project");
    console.print("vistta test --filter=\"pattern\"\tRuns all the tests that match the filter pattern/s in the current project");
    console.print("vistta test --only\tRuns all the tests that have the only");
  }

  async main(_, ...argv) {
    let [args, options] = this.parse(argv);
    this.#options = options;
    if (args.length === 0) args = ["**/*.test.js", "**/*.test.ts"];
    for (let i = 0, len = args.length; i < len; i++)
      args[i] = fs.resolve(cwd, args[i])
    const entries = fs.glob(args);
    let entry = (await entries.next())?.value;
    if (!process.env.NODE_DEBUG) console.disable();
    while (entry) {
      try {
        process.chdir(fs.dirname(entry));
        if (!entry.includes("\\node_modules\\")) await import(fs.resolve(entry));
        await this.#await();
      }
      catch { this.#failed = true; }
      entry = (await entries.next())?.value;
    }
    if (!process.env.NODE_DEBUG) console.enable();
    let output = "";
    for (let i = 0, len = this.#results.length; i < len; i++) {
      const { name, tests } = this.#results[i];
      if (name) output += `\n${name}\n`;
      const [results, passing, total, time] = processTests(tests);
      output += `${results}${passing === total ? COLORS.GREEN : COLORS.RED}${passing}/${total} passing ${COLORS.RESET + COLORS.DIM}(${time}ms)${COLORS.RESET}\n`
    }
    console.print(output);
    process.exit(this.#failed ? -1 : 0);
  }

  async suite(only, name, callback) {
    if (this.#suite) throw new Error("Suites/Describes cannot be stacked");
    this.#runningCounter++;
    this.#suite = { name, only, tests: [] };
    try {
      const value = callback();
      if (value instanceof Promise) await value;
    } catch { /* Do Nothing */ }
    this.#results.push(this.#suite);
    this.#suite = null;
    this.#runningCounter--;
  }

  async test(only, name, callback) {
    if (
      (this.#options.filter && !name.match(new RegExp(this.#options.filter, "i"))) ||
      (this.#options.only && !(only || this.#suite?.only))
    ) return;
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
      acc += `  ${COLORS.GREEN}✔  ${name} ${COLORS.RESET + COLORS.DIM}(${Math.round(end - start)}ms)${COLORS.RESET}\n`;
      passing++;
    }
    else acc += `  ${COLORS.RED}✖  ${name} ${COLORS.RESET + COLORS.DIM}(${Math.round(end - start)}ms)${COLORS.RESET}\n\t${COLORS.RED + error + COLORS.RESET}\n`;
    total++;
  }
  return [acc, passing, total, Math.round(last - first)];
}

function performance(time = process.hrtime()) {
  return (time[0] * 1000) + (time[1] / 1e6);
}