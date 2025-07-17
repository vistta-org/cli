import { resolve } from "node:path";
import { Bundler } from "../loaders/bundler.js";
import { Loader } from "../loaders/index.js";
import { default as DefaultCLI } from "./default.js";

export default class extends DefaultCLI {
  help() {
    console.print("Bundles the specified entry file");
    console.print("\nUsage:");
    console.print("vistta bundle [filename] [outdir]\tBundles the specified entry file");
  }

  async main(_, ...argv) {
    let [args, options] = this.parse(argv);
    if (args.length === 0) return this.help();
    options = Object.assign({}, this.options, options, { outdir: args[1] });
    new Bundler(new Loader(global.vistta)).run(resolve(process.cwd(), args[0]), options);
  }
}
