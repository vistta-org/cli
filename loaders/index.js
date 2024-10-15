import { Loader } from "../classes/loader.js";
import { initialize as initializeTypescript } from "./typescript.js";

let instance;

export async function initialize(args) {
  await initializeTypescript(args?.options?.compiler || {});
  instance = new Loader(args);
}

export async function resolve(specifier, context, nextResolve, options) {
  return instance.resolve(specifier, context, nextResolve, options);
}

export async function load(url, context, nextLoad) {
  return instance.load(url, context, nextLoad)
}