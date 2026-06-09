import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Runtime } from "../classes/runtime.js";

suite("Runtime", () => {
  test("resolve yields distinct URLs for plain vs bundler imports of the same file", async () => {
    const runtime = new Runtime({ loaders: [], resolvers: [], options: {} });
    const file = import.meta.filename || new URL(import.meta.url).pathname.replace(/^\//, "");
    const captured = [];
    const next = (url) => {
      captured.push(url);
      return url;
    };

    await runtime.resolve(file, {}, next);
    await runtime.resolve(file, { importAttributes: { type: "bundler" } }, next);
    await runtime.resolve(file, { conditions: ["bundler"] }, next);

    expect(captured[0]).not.toEqual(captured[1]);
    expect(captured[0]).not.toEqual(captured[2]);
    expect(captured[1]).toEqual(captured[2]);
    expect(/\?__bundler__$/.test(captured[1])).toEqual(true);
    expect(/\?__bundler__$/.test(captured[0])).toEqual(false);
  });

  test("resolve strips bundler suffix from parentURL when resolving relatives", async () => {
    const runtime = new Runtime({ loaders: [], resolvers: [], options: {} });
    const here = new URL(".", import.meta.url).href;
    const parentURL = here + "runtime.test.js?__bundler__";
    let captured;
    await runtime.resolve("./runtime.test.js", { parentURL, importAttributes: { type: "bundler" } }, (url) => {
      captured = url;
      return url;
    });
    expect(captured.includes("?__bundler__?")).toEqual(false);
    expect(/\?__bundler__$/.test(captured)).toEqual(true);
  });

  test("resolve detects bundler mode from importAttributes.type even without conditions", async () => {
    const runtime = new Runtime({ loaders: [], resolvers: [], options: {} });
    const file = import.meta.filename || new URL(import.meta.url).pathname.replace(/^\//, "");
    const captured = [];
    await runtime.resolve(file, { importAttributes: { type: "bundler" } }, (url) => {
      captured.push(url);
      return url;
    });
    expect(/\?__bundler__$/.test(captured[0])).toEqual(true);
  });

  test("resolve marks context.file for absolute bundler imports", async () => {
    const runtime = new Runtime({ loaders: [], resolvers: [], options: {} });
    const dir = mkdtempSync(join(tmpdir(), "vistta-runtime-"));
    const file = join(dir, "page.jsx");
    writeFileSync(file, "export default 1;");
    const ctx = { importAttributes: { type: "bundler" } };
    await runtime.resolve(file, ctx, (url) => url);
    expect(ctx.file).toEqual(true);
  });

  test("resolve preserves non-bundler query string params", async () => {
    const runtime = new Runtime({ loaders: [], resolvers: ["js"], options: {} });
    const dir = mkdtempSync(join(tmpdir(), "vistta-runtime-"));
    const file = join(dir, "data.js");
    writeFileSync(file, "export default 1;");
    const here = new URL(import.meta.url);
    const hereURL = new URL(".", here).href;
    const captured = [];
    await runtime.resolve("./data.js?type=json", { parentURL: hereURL }, (url) => {
      captured.push(url);
      return url;
    });
    expect(captured[0].includes("type=json")).toEqual(true);
    expect(/\?__bundler__$/.test(captured[0])).toEqual(false);
  });
});
