import { Console } from "./index.js";
if (typeof window !== "undefined") window.console = new Console();
if (typeof global !== "undefined") global.console = new Console();
