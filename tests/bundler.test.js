import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bundler } from "../classes/bundler.js";
import { Command } from "../classes/command.js";
import { Runtime } from "../classes/runtime.js";

suite("Bundler", () => {
  test("constructor with Runtime stores it as the loader", () => {
    const runtime = new Runtime({ loaders: [], resolvers: [], options: {} });
    const bundler = new Bundler(runtime);
    expect(typeof bundler.run).toEqual("function");
    expect(typeof bundler.import).toEqual("function");
  });

  test("constructor with Command builds a Runtime from command options", () => {
    const cmd = new Command();
    const bundler = new Bundler(cmd);
    expect(typeof bundler.run).toEqual("function");
  });

  test("constructor with no argument falls back to process.vistta", () => {
    process.vistta = { loaders: [], resolvers: [], options: {} };
    const bundler = new Bundler();
    expect(typeof bundler.run).toEqual("function");
  });

  test("constructor throws on invalid argument", () => {
    let caught;
    try {
      new Bundler(123);
    } catch (e) {
      caught = e;
    }
    expect(caught.message).toMatch("Invalid first argument");
  });

  test("run() applies defaults from runtime.options.bundler", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vistta-bundler-"));
    const entry = join(dir, "entry.js");
    writeFileSync(entry, "export const greeting = 'hi';\n");

    const runtime = new Runtime({
      loaders: [],
      resolvers: ["js"],
      options: { bundler: { target: "es2020" } },
    });
    const bundler = new Bundler(runtime);
    const { code, errors } = await bundler.run(entry, { write: false, logLevel: "silent" });
    expect((errors || []).length).toEqual(0);
    expect(code).toInclude("greeting");
    expect(code).toInclude("hi");
  });

  test("run() with exports option rewrites entry to a re-export via @exports namespace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vistta-bundler-"));
    const entry = join(dir, "page.jsx");
    writeFileSync(entry, "export default function Page() { return null; }\n");

    const runtime = new Runtime({ loaders: [], resolvers: ["jsx"], options: {} });
    const bundler = new Bundler(runtime);
    const { code, errors } = await bundler.run(entry, {
      write: false,
      logLevel: "silent",
      exports: "default",
    });
    expect((errors || []).length).toEqual(0);
    expect(code).toInclude("Page");
  });

  test("run() exposes window namespace defaults and named exports", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vistta-bundler-"));
    const entry = join(dir, "entry.js");
    writeFileSync(
      entry,
      'import Files, { Files as NamedFiles } from "@vistta/connect/files";\nimport { equals } from "@vistta/connect/utils";\nexport const getFile = () => Files.get();\nexport const getNamedFile = () => NamedFiles.get();\nexport const compare = (left, right) => equals(left, right);\n',
    );

    const runtime = new Runtime({ loaders: [], resolvers: ["js"], options: {} });
    const bundler = new Bundler(runtime);
    const { code, errors } = await bundler.run(entry, {
      write: false,
      logLevel: "silent",
      format: "cjs",
      paths: {
        "@vistta/connect/files": { path: "files", namespace: "window" },
        "@vistta/connect/utils": { path: "utils", namespace: "window" },
      },
    });
    expect((errors || []).length).toEqual(0);

    const browser = /** @type {any} */ (globalThis);
    browser.window = {};
    const module = { exports: {} };
    new Function("window", "module", "exports", code)(browser.window, module, module.exports);
    browser.window.files = { default: { get: () => "file" }, Files: { get: () => "named" } };
    browser.window.utils = { equals: (left, right) => left === right };
    expect(module.exports.getFile()).toEqual("file");
    expect(module.exports.getNamedFile()).toEqual("named");
    expect(module.exports.compare("utils", "utils")).toEqual(true);
  });

  test("run() throws when source has syntax errors", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vistta-bundler-"));
    const entry = join(dir, "entry.js");
    writeFileSync(entry, "this is not valid javascript !@#$\n");

    const runtime = new Runtime({ loaders: [], resolvers: ["js"], options: {} });
    const bundler = new Bundler(runtime);
    let caught;
    try {
      await bundler.run(entry, { write: false, logLevel: "silent" });
    } catch (e) {
      caught = e;
    }
    expect(caught.message).toMatch("Build failed");
  });
});
