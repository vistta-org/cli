import { Command } from "../classes/command.js";

suite("CLI", () => {
  let cmd;
  test("register adds a loader", () => {
    cmd = new Command();
    cmd.register("/path/to/loader.js", { type: "custom", filter: ".*\\.custom" });
    expect(cmd.loaders.length).toEqual(1);
    expect(cmd.loaders[0].main).toEqual("/path/to/loader.js");
    expect(cmd.loaders[0].type).toEqual("custom");
    expect(cmd.loaders[0].filter).toEqual(".*\\.custom");
  });

  test("resolve adds new extensions", () => {
    cmd = new Command();
    cmd.resolve("ts", "json");
    expect(cmd.resolvers).toInclude("ts");
    expect(cmd.resolvers).toInclude("json");
  });

  test("main throws error if not implemented", () => {
    cmd = new Command();
    expect(() => cmd.main()).toThrow("Method 'main' must be implemented.");
  });

  test("help does not throw by default", () => {
    cmd = new Command();
    expect(() => cmd.help()).not.toThrow();
  });

  test("define sets global and env variables", () => {
    cmd = new Command();
    cmd.define("global", "FOO", 123);
    cmd.define("env", "BAR", "baz");
    expect(global["FOO"]).toEqual(123);
    expect(process.env["BAR"]).toEqual("baz");
  });
});
