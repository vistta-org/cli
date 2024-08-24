import { CLI } from "../index.js";
import fs from "@vistta/fs";

const dirname = fs.dirname(import.meta.url);

export default class extends CLI {
  constructor(options) {
    super(options);
    this.register(fs.resolve(dirname, "../loaders/file.js"), "*");
    this.register(fs.resolve(dirname, "../loaders/typescript.js"), "*", ["ts", "mts", "cts"], true);
    this.register(fs.resolve(dirname, "../loaders/json.js"), "*", "json");
    this.register(fs.resolve(dirname, "../loaders/bundler.js"), "bundler");
  }

  async main(file) {
    if (process.env.NODE_ENV === "development") await this.outdated();
    import(fs.resolve(process.cwd(), file));
  }

  async outdated() {
    const modules = await (await import("../utils"))?.getOutdatedPackages(process.cwd());
    for (let i = 0, len = modules.length; i < len; i++) {
      const { name, current, wanted, latest } = modules[i];
      if (current === wanted)
        system.info(`Module "${name}" has a new version (${latest})`);
      else system.warn(`Module "${name}" is outdated (${latest})`);
    }
  }
}