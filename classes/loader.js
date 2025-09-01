/* eslint-disable no-unused-vars */
export class Loader {
  constructor() {}

  /**
   * Main method to execute the loader.
   * @abstract
   * @param {string} source The source code to load/process
   * @param {Object} properties Properties for the loader
   */
  load(source, properties) {
    throw new Error("Method 'load' must be implemented.");
  }
}
export default Loader;
