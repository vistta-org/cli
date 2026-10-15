import fs from "@vistta/fs";
import { relative } from "node:path";
import { Command } from "../classes/command.js";
import { getOutdatedPackages, importJSON, incrementPackageVersion, parseArgs } from "../utils.js";

const HELP = {
  name: ["name", "Print the project name."],
  version: [
    "version [increment|version] [prerelease-id]",
    "Print or change the project version. Increments: major, minor, patch, premajor, preminor, prepatch, prerelease.",
  ],
  outdated: [
    "outdated [dependency]",
    "Compare installed, wanted (within the declared range), and latest dependency versions.",
  ],
  update: [
    "update [dependency] [--compatible] [--dry-run]",
    "Update dependency ranges to latest; this may include major upgrades. --compatible selects wanted versions instead.",
  ],
  patch: ["patch [dependency] [--dry-run]", "Alias for update --compatible. This is range-compatible, not patch-only."],
};

export default class extends Command {
  async help(_, command) {
    if (command && !Object.hasOwn(HELP, command))
      throw new Error(`Unknown project command "${command}". Run vistta project --help.`);
    console.print("Project metadata and dependency maintenance\n");
    for (const [usage, description] of command ? [HELP[command]] : Object.values(HELP)) {
      console.print(`  vistta project ${usage}\n    ${description}\n`);
    }
    if (!command || ["outdated", "update", "patch"].includes(command))
      console.print(
        "Wanted respects npm policies and dependency ranges. Updates edit package.json only; run npm install afterward.",
      );
  }

  async main(_, command, ...args) {
    if (!command || command === "help") return this.help(_, args[0]);
    if (!Object.hasOwn(HELP, command)) return this.help(_, command);
    const [values, options] = parseArgs(args);
    const allowed = command === "update" ? ["compatible", "dry-run"] : command === "patch" ? ["dry-run"] : [];
    for (const [name, value] of Object.entries(options)) {
      if (!allowed.includes(name)) throw new Error(`Unknown option --${name} for project ${command}`);
      if (typeof value !== "boolean") throw new Error(`--${name} must be a boolean flag`);
    }
    const limit = command === "name" ? 0 : command === "version" ? 2 : 1;
    if (values.length > limit) throw new Error(`Too many arguments. Run vistta project ${command} --help.`);
    switch (command) {
      case "name":
        return console.print(process.env.PROJECT_NAME);
      case "version":
        if (!values[0]) return console.print(process.env.PROJECT_VERSION);
        return console.print(
          await incrementPackageVersion(fs.resolve(process.env.PROJECT_PATH, "package.json"), values[0], values[1]),
        );
      case "outdated":
      case "patch":
      case "update":
        process.exit(await dependencies(command, values[0], options));
    }
  }
}

async function dependencies(command, dependency, options) {
  const modules = await getOutdatedPackages(process.cwd());
  const selected = modules.filter((entry) => !dependency || entry.name === dependency);
  if (!selected.length) {
    console.print(
      dependency
        ? `No outdated dependency "${dependency}" found in this scope.`
        : "All checked dependencies are up to date.",
    );
    return 0;
  }
  if (command === "outdated") {
    const rows = [
      ["Dependency", "Current", "Wanted", "Latest", "Manifest", "Type"],
      ...selected.map((entry) => [
        entry.name,
        entry.current || "MISSING",
        entry.wanted || "-",
        entry.latest || "-",
        relative(process.cwd(), entry.package) || "package.json",
        entry.dev ? "dev" : "prod",
      ]),
    ];
    const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
    for (const row of rows)
      console.print(
        row
          .map((value, column) => value.padEnd(widths[column]))
          .join("  ")
          .trimEnd(),
      );
    const compatible = selected.filter((entry) => !entry.current || entry.current !== entry.wanted).length;
    console.print(
      `\n${compatible} compatible update(s) or missing dependency(s); ${selected.length - compatible} latest-only update(s).`,
    );
    console.print("Compatible updates cause a nonzero exit status; latest-only updates are informational.");
    return compatible ? 1 : 0;
  }
  const compatible = command === "patch" || options.compatible === true;
  const changes = new Map();
  let count = 0;
  for (const entry of selected) {
    const target = compatible ? entry.wanted : entry.latest;
    if (!target || entry.current === target) continue;
    const manifest = changes.get(entry.package) || (await importJSON(entry.package));
    const section = entry.dev ? "devDependencies" : "dependencies";
    const previous = manifest[section]?.[entry.name];
    if (typeof previous !== "string") throw new Error(`Dependency "${entry.name}" is missing from ${entry.package}`);
    const next = "^" + target;
    if (previous === next) continue;
    manifest[section][entry.name] = next;
    changes.set(entry.package, manifest);
    count++;
    console.print(
      `${options["dry-run"] ? "Would update" : "Update"}: ${entry.name} ${previous} -> ${next} (${relative(process.cwd(), entry.package)}, ${section})`,
    );
  }
  if (!count) {
    console.print(
      `No ${compatible ? "compatible " : ""}dependency range changes needed. Run npm install if installed versions are behind.`,
    );
    return 0;
  }
  if (!options["dry-run"]) {
    for (const [path, manifest] of changes) await fs.writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
  }
  console.print(
    `\n${options["dry-run"] ? "Would change" : "Changed"} ${count} dependency range(s) in ${changes.size} manifest(s).`,
  );
  console.print(
    options["dry-run"] ? "Dry run: no files changed." : "Run npm install to update installed packages and the lockfile.",
  );
  return 0;
}
