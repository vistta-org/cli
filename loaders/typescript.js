import { transform } from "esbuild";
import { Loader } from "../index.js";

export default class TypescriptLoader extends Loader {
  compilerOptions;

  constructor(options) {
    super(options);
    this.compilerOptions = options.compiler || {};
  }

  /**
   * @param {string} source
   * @param {{ path?: string, extension?: string, [key: string]: any }} options
   */
  // eslint-disable-next-line no-unused-vars
  async load(source, options) {
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
