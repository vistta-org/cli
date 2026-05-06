/// <reference path="@vistta/console" />

interface CliRuntimeData {
  loaders: any[];
  resolvers: string[];
  options: any;
  port?: any;
  main?: (...args: any[]) => any;
}

declare namespace NodeJS {
  interface Process {
    argv: string[];
    env: Record<string, string | undefined>;
    chdir(directory: string): void;
    cwd(): string;
    exit(code?: number): never;
    on(event: string, listener: (...args: any[]) => void): void;
    send?(message: any): void;
    restart?: () => void;
    vistta: CliRuntimeData;
  }
}

declare var vistta: CliRuntimeData;
declare var loaders: {
  send: (event: string, ...args: any[]) => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
  shared: Record<string, any>;
};
declare var main: {
  send: (event: string, ...args: any[]) => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
  shared: Record<string, any>;
};

declare var suite: {
  (name: string, callback: () => void, options?: { only?: boolean; skip?: boolean }): void;
  only(name: string, callback: () => void): void;
  skip(name: string, callback: () => void): void;
};

declare var test: {
  (name: string, callback: () => void, options?: { only?: boolean; skip?: boolean }): void;
  only(name: string, callback: () => void): void;
  skip(name: string, callback: () => void): void;
};

interface ExpectNotMatchers {
  toEqual(expected: any, unit?: string): void;
  toBeLessThan(expected: any, unit?: string): void;
  toBeGreaterThan(expected: any, unit?: string): void;
  toInclude(expected: any): void;
  toMatch(expected: string | RegExp): void;
  toThrow(expected?: any): void;
}

interface ExpectMatchers {
  toEqual(expected: any): void;
  toBeLessThan(expected: any, unit?: string): void;
  toBeGreaterThan(expected: any, unit?: string): void;
  toInclude(expected: any): void;
  toMatch(expected: string | RegExp): void;
  toThrow(expected?: any): void;
  not: ExpectNotMatchers;
}

declare function expect(value: any, label?: string): ExpectMatchers;
declare function setImmediate(callback: (...args: any[]) => void): any;
