import { resolve } from "node:path";
import { default as DefaultCLI } from "./default.js";
import { Bundler } from "../loaders/bundler.js"
import { Loader } from "../loaders/index.js";

export default class extends DefaultCLI {

  help() {
    system.log("Bundles the specified entry file");
    system.log("\nUsage:");
    system.log("vistta bundle [filename] [outdir]\tBundles the specified entry file");
  }

  async main(_, ...argv) {
    let [args, options] = this.parse(argv);
    if (args.length === 0) return this.help();
    options = Object.assign(this.options, options);
    options.filename = resolve(process.cwd(), args[0]);
    options.outdir = args[1];
    new Bundler(new Loader(global.vistta)).run(options);
  }
}