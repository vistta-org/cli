import { TestRunner } from "../classes/test-runner.js";

if (typeof performance !== "function") globalThis.performance = () => Date.now();

suite("TestRunner", () => {
  test("suite().test() registers a passing test", async () => {
    const runner = new TestRunner();
    runner.suite("s", () => {
      runner.test("t", () => 1);
    });
    const results = await runner.run();
    expect(results[0].name).toEqual("s");
    expect(results[0].tests[0].name).toEqual("t");
    expect(results[0].tests[0].status).toEqual("pass");
    expect(results[0].tests[0].result).toEqual(1);
  });

  test("failing test reports status=fail with the error", async () => {
    const runner = new TestRunner();
    runner.suite("s", () => {
      runner.test("boom", () => {
        throw new Error("kaboom");
      });
    });
    const results = await runner.run();
    expect(results[0].tests[0].status).toEqual("fail");
    expect(results[0].tests[0].error.message).toEqual("kaboom");
  });

  test("async tests are awaited before status is set", async () => {
    const runner = new TestRunner();
    runner.suite("s", () => {
      runner.test("async", async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "done";
      });
    });
    const results = await runner.run();
    expect(results[0].tests[0].status).toEqual("pass");
    expect(results[0].tests[0].result).toEqual("done");
  });

  test("test.skip is recorded as 'skip'", async () => {
    const runner = new TestRunner();
    runner.suite("s", () => {
      runner.test.skip("skipped", () => {});
    });
    const results = await runner.run();
    expect(results[0].tests[0].status).toEqual("skip");
  });

  test("only: option restricts execution to marked tests", async () => {
    const runner = new TestRunner({ only: true });
    runner.suite("s", () => {
      runner.test("not run", () => "x");
      runner.test.only("run", () => "y");
    });
    const results = await runner.run();
    const names = results[0].tests.map((t) => t.name);
    expect(names.length).toEqual(1);
    expect(names[0]).toEqual("run");
  });

  test("filter option restricts by test name (case-insensitive)", async () => {
    const runner = new TestRunner({ filter: "MATCH" });
    runner.suite("s", () => {
      runner.test("will match", () => {});
      runner.test("will skip", () => {});
    });
    const results = await runner.run();
    const names = results[0].tests.map((t) => t.name);
    expect(names.length).toEqual(1);
    expect(names[0]).toEqual("will match");
  });

  test("suite errors are swallowed and surfaced via empty tests", async () => {
    const runner = new TestRunner();
    runner.suite("s", () => {
      throw new Error("setup failed");
    });
    const results = await runner.run();
    expect(results.length).toEqual(1);
    expect(results[0].tests.length).toEqual(0);
  });
});
