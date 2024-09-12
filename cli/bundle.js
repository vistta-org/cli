import { resolve } from "node:path";
import { default as DefaultCLI } from "./default.js";
import { bundle } from "../loaders/bundler.js"
import { evalCLIString } from "../utils.js";

export default class extends DefaultCLI {

  help() {
    system.log("vistta bundle [filename] [outdir]");
    system.log("\nUsage:\n");
    system.log("vistta bundle [filename] [outdir]\tBundles the specified entry file");
  }

  async main(_, ...args) {
    let i = 0;
    const options = {};
    while (i < args.length) {
      const [option, value] = args[i].toLowerCase().split("=");
      if (option.startsWith("--")) {
        options[option.slice(2)] = evalCLIString(value);
        args.splice(i, 1);
      }
      else i++;
    }
    if (args.length === 0) return this.help();
    options.filename = resolve(process.cwd(), args[0]);
    options.outdir = args[1];
    bundle(options);
  }
}