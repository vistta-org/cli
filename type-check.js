import { parentPort, workerData } from "node:worker_threads";
import { checkTypes } from "./tools.js";

parentPort.postMessage(await checkTypes(workerData.entry, workerData.directories));
