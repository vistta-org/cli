/**
 * @typedef {{ only?: boolean; filter?: string }} TestRunnerOptions
 */

/**
 * @typedef {{
 *  name: string;
 *  start?: number;
 *  end?: number;
 *  status?: "pass" | "fail";
 *  result?: any;
 *  error?: any;
 * }} TestResult
 */

/**
 * @typedef {{ only: boolean; skip: boolean; name: string; callback: () => any }} SuiteDefinition
 */

/**
 * @typedef {{ only?: boolean; skip?: boolean; name?: string; tests: TestResult[]; time?: number }} SuiteResult
 */

/**
 * @typedef {{
 *  toEqual: (value: any, unit?: string) => void;
 *  toBeLessThan: (value: any, unit?: string) => void;
 *  toBeGreaterThan: (value: any, unit?: string) => void;
 *  toInclude: (value: any) => void;
 *  toMatch: (regex: string | RegExp) => void;
 *  toThrow: (message?: string) => void;
 * }} ExpectMatcherSet
 */

/**
 * @typedef {ExpectMatcherSet & { not: ExpectMatcherSet }} ExpectMatchers
 */

export class TestRunner {
  /** @type {TestRunnerOptions} */
  #options = {};
  /** @type {SuiteDefinition[]} */
  #suites = [];
  /** @type {SuiteResult[]} */
  #results;
  /** @type {SuiteResult | null} */
  #active;
  /** @type {number} */
  #running;

  /**
   * @param {TestRunnerOptions} [options]
   */
  constructor(options = {}) {
    this.#options = options;
    this.suite = this.#suite.bind(this);
    this.suite.only = (name, callback) => this.#suite(name, callback, { only: true });
    this.suite.skip = (name, callback) => this.#suite(name, callback, { skip: true });
    this.test = this.#test.bind(this);
    this.test.only = (name, callback) => this.#test(name, callback, { only: true });
    this.test.skip = (name, callback) => this.#test(name, callback, { skip: true });
  }

  /**
   * @returns {Promise<SuiteResult[]>}
   */
  async run() {
    this.#running = 0;
    this.#results = [];
    for (const suite of this.#suites) {
      this.#active = { only: suite.only, name: suite.name, skip: suite.skip, tests: [] };
      try {
        await suite.callback();
      } catch {
        /* Do Nothing */
      }
      this.#results.push(this.#active);
      this.#active = null;
    }
    while (this.#running > 0) await new Promise((resolve) => setTimeout(resolve, 100));
    return this.#results;
  }

  /**
   * @param {string} name
   * @param {() => any} callback
   * @param {{ only?: boolean, skip?: boolean }} options
   * @returns {Promise<void>}
   */
  async #suite(name, callback, { only, skip } = {}) {
    if (this.#active) throw new Error("Suites cannot be stacked");
    this.#suites.push({ only, skip, name, callback });
  }

  /**
   * @param {string} name
   * @param {() => any | Promise<any>} callback
   * @param {{ only?: boolean, skip?: boolean }} options
   * @returns {Promise<void>}
   */
  async #test(name, callback, { only, skip } = {}) {
    if (
      (this.#options.filter && !name.match(new RegExp(this.#options.filter, "i"))) ||
      (this.#options.only && !(only || this.#active?.only))
    )
      return;
    const test = { name };
    if (skip || this.#active?.skip) {
      test.status = "skip";
      this.#active?.tests.push(test);
      return;
    } else this.#running++;
    test.start = performance();
    if (this.#active) this.#active.tests.push(test);
    else this.#results.push({ tests: [test], time: test.time });
    try {
      test.result = await callback();
      test.status = "pass";
      test.end = performance();
    } catch (error) {
      test.status = "fail";
      test.error = error;
      test.end = performance();
    }
    this.#running--;
  }

  /**
   * @param {any} target
   * @param {string} [label]
   * @returns {ExpectMatchers}
   */
  expect(target, label) {
    return {
      not: {
        toEqual: (value, unit = "") => {
          if (target !== value) return;
          throw new Error(`expected ${label ? label + "(" + target + ")" : target} to not equal ${value}${unit}`);
        },
        toBeLessThan: (value, unit = "") => {
          if (target >= value) return;
          throw new Error(`expected ${label ? label + "(" + target + ")" : target} to not be less than ${value}${unit}`);
        },
        toBeGreaterThan: (value, unit = "") => {
          if (target <= value) return;
          throw new Error(`expected ${label ? label + "(" + target + ")" : target} to not be greater than ${value}${unit}`);
        },
        toInclude: (value) => {
          if (target.indexOf(value) === -1) return;
          throw new Error(`expected ${label ? label + "(" + target + ")" : target} to not include ${value}`);
        },
        toMatch: (regex) => {
          if (!target.match(new RegExp(regex))) return;
          throw new Error(`expected ${label ? label + "(" + target + ")" : target} to not match ${regex}`);
        },
        toThrow: (message) => {
          try {
            target();
          } catch (error) {
            if (!message)
              throw new Error(`expected ${label ? label + "()" : "function()"} to not throw, but got ${error.message}`);
            if (error.message === message)
              throw new Error(
                `expected ${label ? label + "()" : "function()"} to not throw ${message}, but got ${error.message}`,
              );
            if (error.message.match(new RegExp(message)))
              throw new Error(
                `expected ${label ? label + "()" : "function()"} to not throw ${message}, but got ${error.message}`,
              );
            return;
          }
        },
      },
      toEqual: (value, unit = "") => {
        if (target === value) return;
        throw new Error(`expected ${label ? label + "(" + target + ")" : target} to equal ${value}${unit}`);
      },
      toBeLessThan: (value, unit = "") => {
        if (target < value) return;
        throw new Error(`expected ${label ? label + "(" + target + ")" : target} to be less than ${value}${unit}`);
      },
      toBeGreaterThan: (value, unit = "") => {
        if (target > value) return;
        throw new Error(`expected ${label ? label + "(" + target + ")" : target} to be greater than ${value}${unit}`);
      },
      toInclude: (value) => {
        if (target.indexOf(value) > -1) return;
        throw new Error(`expected ${label ? label + "(" + target + ")" : target} to include ${value}`);
      },
      toMatch: (regex) => {
        if (target.match(new RegExp(regex))) return;
        throw new Error(`expected ${label ? label + "(" + target + ")" : target} to match ${regex}`);
      },
      toThrow: (message) => {
        try {
          target();
        } catch (error) {
          if (!message) return;
          if (error.message === message) return;
          if (error.message.match(new RegExp(message))) return;
          throw new Error(`expected ${label ? label + "()" : "function()"} to throw ${message}, but got ${error.message}`);
        }
      },
    };
  }
}

// @ts-ignore
function performance(time = process.hrtime()) {
  return time[0] * 1000 + time[1] / 1e6;
}
