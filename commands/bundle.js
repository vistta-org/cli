import { resolve } from "node:path";
import { Bundler } from "../classes/bundler.js";
import { Runtime } from "../classes/runtime.js";
import { parseArgs } from "../utils.js";
import DefaultCommand from "./default.js";

export default class BundlerCommand extends DefaultCommand {
  async help() {
    console.print("Bundles the specified entry file");
    console.print("\nUsage:");
    console.print("vistta bundle [filename] [outdir]\tBundles the specified entry file");
  }

  async main(_, ...argv) {
    let [args, options] = parseArgs(argv);
    if (args.length === 0) return this.help();
    options = Object.assign({}, process.vistta?.options?.bundler || {}, options, { outdir: args[1] });
    new Bundler(new Runtime(global.vistta)).run(resolve(process.cwd(), args[0]), options);
  }
}
