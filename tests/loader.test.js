import { Loader } from "../classes/loader.js";

suite("Loader", () => {
  test("base load() throws 'must be implemented'", () => {
    const loader = new Loader({});
    expect(() => loader.load("source", {})).toThrow("Method 'load' must be implemented.");
  });

  test("subclass can override load()", () => {
    let captured;
    class Custom extends Loader {
      load(source, properties) {
        captured = { source, properties };
        return { code: "ok" };
      }
    }
    const loader = new Custom({ x: 1 });
    const result = loader.load("input", { type: "json" });
    expect(result.code).toEqual("ok");
    expect(captured.source).toEqual("input");
    expect(captured.properties.type).toEqual("json");
  });
});
