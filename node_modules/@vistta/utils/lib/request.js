/**
 * @typedef {Object} Response
 * @property {any} data Request response data.
 * @property {status} status Request status code.
 * @property {string} statusText Request status text.
 * @property {Headers} headers Request headers.
 */

/**
 * The options for making a request.
 * @typedef {Object} Options
 * @property {{ [key: string]: string }} [headers] - Additional parameters to pass with the request.
 * @property {AbortController} [controller] - An AbortController instance that can be used to abort the request.
 * @property {{ [key: string]: string }} [params] - Additional parameters to pass with the request.
 * @property {"blob" | "json" | "arrayBuffer" | "formData" | "text"} [content] - The response data type.
 * @property {number} [timeout] - The maximum time in milliseconds to wait for a response before aborting the request.
 * @property {BodyInit|Object|FormData} [body] - The body of the request.
 */

/**
 * Sends an HTTP request and returns a Promise that resolves to the response.
 * 
 * @param {string} url - The URL for the request.
 * @param {Options} [options] Options for the request.
 * @param {string} [options.method] The HTTP method for the request (e.g. GET, POST).
 * @returns {Promise<Response>} A promise that resolves to the response.
 */
const request = (url, { method = "get", controller, headers, params, timeout, content, ...options } = {}) => {
  if (!controller) controller = new AbortController();
  const { body, contentType } = transformBody(options?.body);
  // eslint-disable-next-line no-async-promise-executor
  const response = new Promise(async (resolve, reject) => {
    headers = await buildHeaders(url, headers, contentType, method);
    if (params) params = new URLSearchParams(params);
    timeout = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;
    try {
      const response = await fetch(params ? `${url}?${params.toString()}` : url, {
        ...options,
        headers: headers,
        body: body,
        method: method?.toUpperCase(),
        signal: controller.signal,
      });
      if (!response.ok)
        return reject(new Error(await response.text() || response.status + "" + response.statusText));
      return resolve({
        data: await response[content || convertResponse(response.headers.get("content-type"))](),
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      if (!controller.signal.aborted) return reject(error);
    } finally {
      clearTimeout(timeout);
    }
  });
  response.abort = () => controller.abort();
  return response;
};

/**
 * Sends a GET HTTP request and returns a Promise that resolves to the response.
 * 
 * @param {string} url - The URL for the request.
 * @param {Options} [options] Options for the request.
 * @returns {Promise<Response>} A promise that resolves to the response data.
 */
request.get = (url, options) => request(url, { method: "get", ...options });

/**
 * Sends a POST HTTP request and returns a Promise that resolves to the response.
 * 
 * @param {string} url - The URL for the request.
 * @param {Options} [options] Options for the request.
 * @returns {Promise<Response>} A promise that resolves to the response data.
 */
request.post = (url, options) => request(url, { method: "post", ...options });

/**
 * Sends a HEAD HTTP request and returns a Promise that resolves to the response.
 * 
 * @param {string} url - The URL for the request.
 * @param {Options} [options] Options for the request.
 * @returns {Promise<Response>} A promise that resolves to the response data.
 */
request.head = (url, options) => request(url, { method: "head", ...options });

/**
 * Sends a PUT HTTP request and returns a Promise that resolves to the response.
 * 
 * @param {string} url - The URL for the request.
 * @param {Options} [options] Options for the request.
 * @returns {Promise<Response>} A promise that resolves to the response data.
 */
request.put = (url, options) => request(url, { method: "put", ...options });

/**
 * Sends a DELETE HTTP request and returns a Promise that resolves to the response.
 * 
 * @param {string} url - The URL for the request.
 * @param {Options} [options] Options for the request.
 * @returns {Promise<Response>} A promise that resolves to the response data.
 */
request.delete = (url, options) => request(url, { method: "delete", ...options });

/**
 * Sends a CONNECT HTTP request and returns a Promise that resolves to the response.
 * 
 * @param {string} url - The URL for the request.
 * @param {Options} [options] Options for the request.
 * @returns {Promise<Response>} A promise that resolves to the response data.
 */
request.connect = (url, options) => request(url, { method: "connect", ...options });

/**
 * Sends an OPTIONS HTTP request and returns a Promise that resolves to the response.
 * 
 * @param {string} url - The URL for the request.
 * @param {Options} [options] Options for the request.
 * @returns {Promise<Response>} A promise that resolves to the response data.
 */
request.options = (url, options) => request(url, { method: "options", ...options });

/**
 * Sends a TRACE HTTP request and returns a Promise that resolves to the response.
 * 
 * @param {string} url - The URL for the request.
 * @param {Options} [options] Options for the request.
 * @returns {Promise<Response>} A promise that resolves to the response data.
 */
request.trace = (url, options) => request(url, { method: "trace", ...options });

/**
 * Sends a PATCH HTTP request and returns a Promise that resolves to the response.
 * 
 * @param {string} url - The URL for the request.
 * @param {Options} [options] Options for the request.
 * @returns {Promise<Response>} A promise that resolves to the response data.
 */
request.patch = (url, options) => request(url, { method: "patch", ...options });

export { request };

//

function transformBody(body) {
  if (body instanceof FormData) return { body: body, contentType: "auto" };
  return { body: JSON.stringify(body), contentType: "default" };
}

async function buildHeaders(url, headers, contentType, method) {
  if (!(headers instanceof Headers)) headers = new Headers(typeof headers === "object" ? headers : {});
  headers.append("accept", "application/json, text/plain, */*");
  headers.append("path", url);
  headers.append("method", method || "GET");
  headers.append("sec-fetch-mode", "cors");
  headers.append("sec-fetch-site", "same-origin");
  if (contentType !== "auto" && !headers.get("Content-Type"))
    headers.append("Content-Type", contentType !== "default" ? contentType : "application/json");
  return headers;
}

function convertResponse(contentType) {
  if (typeof contentType !== "string") return "blob";
  if (contentType.includes("application/json")) return "json";
  if (contentType.includes("application/octet-stream")) return "arrayBuffer";
  if (contentType.includes("multipart/form-data")) return "formData";
  if (contentType.includes("text/")) return "text";
  return "blob";
}