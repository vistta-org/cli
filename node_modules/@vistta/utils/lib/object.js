/**
 * Checks if a value is an object.
 *
 * @param {any} object - The value to check.
 * @returns {boolean} Whether the value is an object.
 */
export function isObject(object) {
  return object != null && typeof object === "object";
}

/**
 * Checks if an object is empty.
 *
 * @param {Object} object - The object to check.
 * @returns {boolean} Whether the object is empty.
 */
export function isObjectEmpty(object) {
  return Object.keys(object).length === 0;
}

/**
 * Checks if an object is plain.
 *
 * @param {Object} object - The object to check.
 * @returns {boolean} Whether the object is plain.
 */
export function isPlainObject(object) {
  return Object.prototype.toString.call(object) === '[object Object]';
}

/**
 * Stringifies an object.
 *
 * @param {Object} object - The object to stringify.
 * @param {boolean} [formatted] - Whether to format the output.
 * @returns {string} The stringified object.
 */
export function stringify(object, formatted = false) {
  return JSON.stringify(object, duplicateReplacer(), !formatted ? null : formatted === true ? 4 : formatted);
}

/**
 * Parses a stringified object.
 *
 * @param {string} object - The stringified object.
 * @param {boolean} [secure] - Whether to use secure parsing.
 * @returns {Object} The parsed object.
 */
export function parse(object, secure = false) {
  if (!secure) return JSON.parse(object);
  try {
    return JSON.parse(object);
  } catch {
    return {};
  }
}

/**
 * Clones an object.
 *
 * @param {Object} object - The object to clone.
 * @param {boolean} [json] - Whether to use JSON parsing.
 * @returns {Object} The cloned object.
 */
export function clone(object, json) {
  return json ? parse(stringify(object)) : structuredClone(object);
}

/**
 * Flattens an object.
 *
 * @param {Object} object - The object to flatten.
 * @param {string} [separator] - The separator to use for nested keys.
 * @param {function} [transformer] - A function to transform keys.
 * @returns {Object} The flattened object.
 */
export function flatten(object, separator = ".", transformer) {
  const helper = (target, prefix) => {
    let flattened = {};
    const keys = Object.keys(target || {});
    for (let i = 0, len = keys.length; i < len; i++) {
      const _key = keys[i];
      let key = typeof transformer === "function" ? transformer(_key) : _key;
      if (prefix) key = `${prefix}${separator}${key}`;
      if (typeof target[_key] === "object" && target[_key] !== null)
        flattened = { ...flattened, ...helper(target[_key], key) };
      else flattened[key] = target[_key];
    }
    return flattened;
  };
  return helper(object);
}

/**
 * Recursively assigns properties of object `b` to object `a`.
 * 
 * @param {Object} a - The target object to which properties will be assigned.
 * @param {Object} b - The source object from which properties will be assigned.
 * @returns {Object} - The modified target object `a`.
 */
export function assign(a, b) {
  if (b == null) return a;
  if (!isPlainObject(a) || !isPlainObject(b)) return b;

  const keys = Object.keys(b);
  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i];
    if (isPlainObject(b[key])) {
      if (!a[key]) a[key] = {};
      a[key] = assign(a[key], b[key]);
    } else {
      a[key] = b[key];
    }
  }
  return a;
}

/**
 * Extracts the specified keys from the given object and deletes them from the object.
 * 
 * @param {Object} object - The object from which to extract and delete keys.
 * @param {...string} keys - The keys to extract and delete from the object.
 * @returns {Array} - An array containing the values of the extracted keys.
 */
export function extract(object, ...keys) {
  const result = [];
  for (let i = 0, len = keys.length; i < len; i++) {
    result.push(object[keys[i]])
    delete object[keys[i]];
  }
  return result;
}

/**
 * Removes the specified keys from the given object.
 * 
 * @param {Object} object - The object from which to remove keys.
 * @param {...string} keys - The keys to remove from the object.
 */
export function remove(object, ...keys) {
  for (let i = 0, len = keys.length; i < len; i++) delete object[keys[i]];
}

function duplicateReplacer(set = new WeakSet()) {
  return function (_, value) {
    if (typeof value === "object" && value !== null) {
      if (set.has(value)) {
        return;
      }
      set.add(value);
    }
    return value;
  };
}