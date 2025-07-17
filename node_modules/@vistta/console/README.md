# **VISTTA Console Library**

The `Console` object provides a set of methods for logging messages to the console. It allows for different log levels, formatting options, and time tracking.

## **Getting Started**

### **Install**

```sh
npm install @vistta/console
```

### **Usage**

```javascript
import { Console } from "@vistta/console.js";

const logger = new Console();

// Log a message
logger.log("Hello, world!");

// Log an error
logger.error("Something went wrong!");

// Log a warning
logger.warn("Attention required!");

// Log a debug message
logger.debug("This is a debug message.");

// Group messages
logger.group("Group 1");
logger.log("Message 1");
logger.log("Message 2");
logger.groupEnd();

// Time a function
logger.time("function_name");
// Function code here
logger.timeEnd("function_name");

// Time a function
const logger2 = new logger.Console({ index: -1, date: false, colors: false });
logger.clear();
logger.log("Index 0");
logger2.log("Index -1");
```

## **API**

```typescript
class Console {
  /**
   * @returns {typeof Console} Console Instance Class.
   */
  get Console();

  /**
   * @returns {string[]} Console instance logs
   */
  get logs();

  /**
   * Creates a new Console instance.
   *
   * @typedef {Object} Options
   * @property {WritableStreamDefaultWriter} [writer] - Writable Stream.
   * @property {Function} [clear] - Function to clear the Stream if available.
   * @property {boolean} [date] - Whether to include the date in logs. Defaults to true.
   * @property {boolean | COLORS} [colors] - Whether to include colors in logs or object of the colors. Defaults to true if no writer is passed.
   * @property {boolean} [trace] - Whether to include the stack trace in logs. Defaults to the value of the `NODE_TRACE` environment variable.
   * @property {boolean} [debug] - Whether to enable debug mode. Defaults to the value of the `NODE_DEBUG` environment variable.
   * @property {number} [index] - The index of the console. Defaults to 0.
   *
   * @param {Options} [options] - Optional configuration options or true for system default.
   */
  constructor(options);

  /**
   * Announces a message.
   *
   * @param {...any} data - The message to announce.
   */
  announce(...data);

  /**
   * Asserts a condition.
   *
   * @param {boolean} condition - The condition to assert.
   * @param {...any} data - The message to log if the condition fails.
   */
  assert(condition, ...data);

  /**
   * Clears the console.
   */
  clear();

  /**
   * Increments a counter for the given key.
   *
   * @param {string} [key] - The key of the counter.
   */
  count(key = "");

  /**
   * Resets the counter for the given key.
   *
   * @param {string} [key] - The key of the counter.
   */
  countReset(key = "");

  /**
   * Logs a message.
   *
   * @param {...any} data - The message to log.
   */
  print(...data);

  /**
   * Logs a new line.
   */
  println();

  /**
   * Logs a debug message.
   *
   * @param {...any} data - The message to log.
   */
  debug(...data);

  /**
   * Logs an object.
   *
   * @param {Object} object - The object to log.
   */
  dir(object);

  /**
   * Logs an XML object.
   *
   * @param {Object} object - The XML object to log.
   */
  dirxml(object);

  /**
   * Logs an error message.
   *
   * @param {...any} data - The error message.
   */
  error(...data);

  /**
   * Starts a new group of logs.
   *
   * @param {...any} data - The message to log for the group header.
   */
  group(...data);

  /**
   * Starts a new group of logs.
   *
   * @param {...any} data - The message to log for the group header.
   */
  groupCollapsed(...data);

  /**
   * Ends a group of logs.
   */
  groupEnd();

  /**
   * Logs an information message.
   *
   * @param {...any} data - The message to log.
   */
  info(...data);

  /**
   * Logs a message.
   *
   * @param {...any} data - The success message.
   */
  log(...data);

  /**
   * Starts a profile measurement.
   *
   * @param {string} key - The key of the profile measurement.
   * @param {boolean} [force] - Overwrites existing keys.
   */
  profile(key, force);

  /**
   * Ends a profile measurement.
   *
   * @param {string} key - The key of the profile measurement.
   */
  profileEnd(key, print = true);

  /**
   * Logs a success message.
   *
   * @param {...any} data - The success message.
   */
  success(...data);

  /**
   * Logs a table.
   *
   * @param {Array<any>} data - The data to log as a table.
   * @param {string} properties - The properties to include in the table header.
   */
  table(data, properties);

  /**
   * Logs a time measurement start.
   *
   * @param {string} key - The key of the time measurement.
   * @param {boolean} [force] - Overwrites existing keys.
   */
  time(key, force = false);

  /**
   * Logs a time measurement end.
   *
   * @param {string} key - The key of the time measurement.
   * @param {boolean} print - Whether to print the time difference. Defaults to true.
   */
  timeEnd(key, print = true);

  /**
   * Logs a time measurement log.
   *
   * @param {string} key - The key of the time measurement.
   * @param {...any} data - The message to log.
   */
  timeLog(key, ...data);

  /**
   * Logs a timestamp.
   *
   * @param {string} key - The key of the time measurement.
   */
  timeStamp(key);

  /**
   * Logs a trace message.
   *
   * @param {...any} data - The message to log.
   */
  trace(...data);

  /**
   * Logs a warning message.
   *
   * @param {...any} data - The warning message.
   */
  warn(...data);
}

/**
 * Object containing ANSI escape codes for text formatting.
 */
const colors = {
  /**
   * @returns {string} Code to reset the console color.
   */
  reset,

  /**
   * @returns {string} Code to make the text bright.
   */
  bright,

  /**
   * @returns {string} Code to make the text dim.
   */
  dim,

  /**
   * @returns {string} Code to underline the text.
   */
  underscore,

  /**
   * @returns {string} Code to blink the text.
   */
  blink,

  /**
   * @returns {string} Code to reverse the text color.
   */
  reverse,

  /**
   * @returns {string} Code to set the text color to black.
   */
  black,

  /**
   * @returns {string} Code to set the text color to red.
   */
  red,

  /**
   * @returns {string} Code to set the text color to green.
   */
  green,

  /**
   * @returns {string} Code to set the text color to yellow.
   */
  yellow,

  /**
   * @returns {string} Code to set the text color to blue.
   */
  blue,

  /**
   * @returns {string} Code to set the text color to magenta.
   */
  magenta,

  /**
   * @returns {string} Code to set the text color to cyan.
   */
  cyan,

  /**
   * @returns {string} Code to set the text color to white.
   */
  white,
};
```

## **License**

Attribution-NonCommercial-NoDerivatives 4.0 International

## **Contributing**

Thank you for your interest in contributing to this project! Please ensure that any contributions respect the licensing terms specified. If you encounter any issues or have suggestions, feel free to report them. All issues will be well received and addressed to the best of our ability. We appreciate your support and contributions!

### **Authors**

- [Tiago Terenas Almeida](https://github.com/tiagomta)
