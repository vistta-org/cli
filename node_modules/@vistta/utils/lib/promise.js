/**
 * Checks if a value is a Promise.
 *
 * @param {any} f - The value to check.
 * @returns {boolean} Whether the value is a Promise.
 */
export function isPromise(f) {
  return f instanceof Promise;
}

/**
 * Checks if a value is an async function.
 *
 * @param {function} f - The value to check.
 * @returns {boolean} Whether the value is an async function.
 */
export function isAsync(f) {
  return f.constructor.name === "AsyncFunction";
}

/**
 * Converts any function or value into Async
 *
 * @param {any} value - Value to convert into a Async.
 * @returns {Promise} Promise.
 */
export async function async(value) {
  if (typeof value === "function")
    return await new Promise((res, rej) => value(res, rej));
  if (value instanceof Promise) return await value;
  return value;
}