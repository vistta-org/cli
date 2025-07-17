import { Console as CustomConsole } from "./index";

declare global {
  var console: CustomConsole;
  interface Console extends CustomConsole {}
}
