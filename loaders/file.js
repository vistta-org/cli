import { fs } from "@vistta/fs";

export async function load(_, { path, type, encoding }) {
  const urlHash = fs.fileId(path) + fs.extname(path);
  if (type === "reader")
    return {
      code: `export default ${JSON.stringify(await fs.readFile(path, encoding))}`,
      resources: [{ path, hash: urlHash }],
    };
  return {
    code: `export default "/resources/${urlHash}";`,
    resources: [{ path, hash: urlHash }],
  };
}
