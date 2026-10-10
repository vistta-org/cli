import { transform } from "esbuild";
import { Loader } from "../index.js";

export default class TypescriptLoader extends Loader {
  compilerOptions;

  constructor(options) {
    super(options);
    this.compilerOptions = options.compiler || {};
  }

  async load(source) {
    try {
      return await transform(source, {
        format: "esm",
        treeShaking: true,
        loader: "ts",
        tsconfigRaw: {
          compilerOptions: this.compilerOptions,
        },
        jsx: "preserve",
        sourcemap: false,
        target: "esnext",
      });
    } catch (e) {
      return { errors: [e] };
    }
  }
}
