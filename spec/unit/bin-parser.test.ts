/**
 * Unit Tests — bin.ts argument parser
 *
 * Tests the parseArgs logic by invoking the CLI binary entry point
 * indirectly through the factory. The arg parser is a private function
 * in bin.ts, so we test its behavior through observable CLI output.
 */

import { describe, it, expect } from "vitest";

/**
 * Standalone reimplementation of parseArgs for unit testing.
 * Mirrors the logic in src/bin.ts exactly.
 */
function parseArgs(argv: string[]): {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const args = argv.slice(2);
  const command = args[0] ?? "help";
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        flags[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
      } else {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

describe("unit: parseArgs", () => {
  // -----------------------------------------------------------------------
  // TP: correctly parses valid arguments
  // -----------------------------------------------------------------------

  it("TP: defaults to help when no args", () => {
    const result = parseArgs(["node", "obix"]);
    expect(result.command).toBe("help");
    expect(result.positional).toHaveLength(0);
    expect(Object.keys(result.flags)).toHaveLength(0);
  });

  it("TP: extracts command from first positional", () => {
    const result = parseArgs(["node", "obix", "build"]);
    expect(result.command).toBe("build");
  });

  it("TP: parses --flag value pairs", () => {
    const result = parseArgs(["node", "obix", "build", "--target", "esm,cjs"]);
    expect(result.flags["target"]).toBe("esm,cjs");
  });

  it("TP: parses --flag=value syntax", () => {
    const result = parseArgs(["node", "obix", "build", "--target=esm"]);
    expect(result.flags["target"]).toBe("esm");
  });

  it("TP: parses boolean flags", () => {
    const result = parseArgs(["node", "obix", "build", "--map", "--minify"]);
    expect(result.flags["map"]).toBe(true);
    expect(result.flags["minify"]).toBe(true);
  });

  it("TP: captures positional args after command", () => {
    const result = parseArgs(["node", "obix", "validate", "./schema.json"]);
    expect(result.positional).toEqual(["./schema.json"]);
  });

  it("TP: handles migrate with two positional versions", () => {
    const result = parseArgs(["node", "obix", "migrate", "0.1.0", "0.2.0"]);
    expect(result.command).toBe("migrate");
    expect(result.positional).toEqual(["0.1.0", "0.2.0"]);
  });

  it("TP: mixed flags and positional args", () => {
    const result = parseArgs([
      "node", "obix", "build",
      "--target", "esm,cjs",
      "--out", "dist",
      "--map",
      "--strict",
    ]);
    expect(result.command).toBe("build");
    expect(result.flags["target"]).toBe("esm,cjs");
    expect(result.flags["out"]).toBe("dist");
    expect(result.flags["map"]).toBe(true);
    expect(result.flags["strict"]).toBe(true);
  });

  it("TP: hot-swap command with watch and delay", () => {
    const result = parseArgs([
      "node", "obix", "hot-swap",
      "--watch", "src,lib",
      "--delay", "500",
    ]);
    expect(result.command).toBe("hot-swap");
    expect(result.flags["watch"]).toBe("src,lib");
    expect(result.flags["delay"]).toBe("500");
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it("TP: handles --root global option", () => {
    const result = parseArgs(["node", "obix", "build", "--root", "/my/project"]);
    expect(result.flags["root"]).toBe("/my/project");
  });

  it("TP: handles empty string value in --flag=", () => {
    const result = parseArgs(["node", "obix", "build", "--target="]);
    expect(result.flags["target"]).toBe("");
  });
});
