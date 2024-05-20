import { resolve } from "path";
process.argv[1] = resolve(process.cwd(), process.env.MAIN);
await import(process.argv[1]);