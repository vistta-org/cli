import { resolve } from "node:path";
import { default as DefaultCLI } from "./default.js";
import { bundle } from "../loaders/bundler.js"

export default class extends DefaultCLI {

  help() {
    system.log("vistta bundle [filename] [outdir]");
    system.log("\nUsage:\n");
    system.log("vistta bundle [filename] [outdir]\tBundles the specified entry file");
  }

  async main(_, ...args) {
    if (args.length === 0) return this.help();
    this.options.filename = resolve(process.cwd(), args[0]);
    this.options.outdir = args[1];
    bundle(this.options);
  }
}