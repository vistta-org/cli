import fs from "@vistta/fs";
import { Loader } from "../index.js";

export default class FileLoader extends Loader {
  async load(_, { path, encoding }) {
    const urlHash = fs.fileId(path) + fs.extname(path);
    return {
      code: `export default ${JSON.stringify(await fs.readFile(path, encoding || "utf8"))}`,
      resources: [{ path, hash: urlHash }],
    };
  }
}
