import { COLORS } from "@vistta/console";
import fs from "@vistta/fs";
import { TestRunner } from "../classes/test-runner.js";
import { parseArgs } from "../utils.js";
import DefaultCommand from "./default.js";

const cwd = process.cwd();

export default class extends DefaultCommand {
  #testRunner;

  constructor() {
    super();
    this.define("env", "NODE_ENV", "testing");
  }

  async help() {
    console.print("Runs all the tests files that match the pattern/s in the current project");
    console.print("\nUsage:");
    console.print("vistta test [...patterns]\tRuns all the tests files that match the pattern/s in the current project");
    console.print(
      'vistta test --filter="pattern"\tRuns all the tests that match the filter pattern/s in the current project',
    );
    console.print("vistta test --only\tRuns all the tests that have the only");
  }

  async main(_, ...argv) {
    let [args, options] = parseArgs(argv);
    this.#testRunner = new TestRunner(options);
    this.define("global", "suite", this.#testRunner.suite);
    this.define("global", "test", this.#testRunner.test);
    this.define("global", "expect", this.#testRunner.expect);
    if (args.length === 0) args = this.resolvers.map((ext) => `**/*.test.${ext}`);
    for (let i = 0, len = args.length; i < len; i++) args[i] = fs.resolve(cwd, args[i]);
    const entries = fs.glob(args);
    let entry = (await entries.next())?.value;
    if (!process.env.NODE_DEBUG) console.disable();
    let failed = false;
    while (entry) {
      try {
        process.chdir(fs.dirname(entry));
        if (!entry.includes("\\node_modules\\")) await import(fs.resolve(entry));
      } catch {
        failed = true;
      }
      entry = (await entries.next())?.value;
    }
    if (!process.env.NODE_DEBUG) console.enable();
    let output = "";
    const results = await this.#testRunner.run();
    for (let i = 0, len = results.length; i < len; i++) {
      const { name, tests } = results[i];
      let passing = 0;
      let total = 0;
      let first, last;
      if (name) output += `\n${name}\n`;
      for (let n = 0, nlen = tests?.length || 0; n < nlen; n++) {
        const { name, status, start, end, result, error } = tests[n];
        if (!first || start < first) first = start;
        if (!last || end > last) last = end;
        if (status === "pass") {
          output += `  ${COLORS.GREEN}PASSED  ${name} ${COLORS.RESET + COLORS.DIM}(${Math.round(end - start)}ms)${COLORS.RESET}\n${typeof result === "string" ? "\t" + COLORS.GREEN + result + COLORS.RESET + "\n" : ""}`;
          passing++;
        } else
          output += `  ${COLORS.RED}FAILED  ${name} ${COLORS.RESET + COLORS.DIM}(${Math.round(end - start)}ms)${COLORS.RESET}\n\t${COLORS.RED + error + COLORS.RESET}\n`;
        total++;
      }
      if (total !== passing) failed = true;
      output += `${passing === total ? COLORS.GREEN : COLORS.RED}${passing}/${total} passing ${COLORS.RESET + COLORS.DIM}(${Math.round(last - first)}ms)${COLORS.RESET}\n`;
    }
    console.print(output);
    process.exit(failed ? -1 : 0);
  }
}
