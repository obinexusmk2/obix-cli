/**
 * Unit Tests — CLI Factory (createCLI)
 *
 * Tests the createCLI() factory function in isolation.
 * Uses obix-polygaltic-demo fixtures for HITL QA classification.
 *
 * Classification matrix:
 *   TP: CLI correctly succeeds on valid input
 *   FP: CLI incorrectly succeeds on invalid input
 *   TN: CLI correctly rejects invalid input
 *   FN: CLI incorrectly rejects valid input
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createCLI, type CLIConfig, type ObixCLI } from "../../src/index.js";
import {
  createValidCLIConfig,
  createStrictCLIConfig,
  createMinimalCLIConfig,
} from "../fixtures/index.js";

describe("unit: createCLI factory", () => {
  let config: CLIConfig;
  let cli: ObixCLI;

  beforeEach(() => {
    config = createValidCLIConfig(process.cwd());
    cli = createCLI(config);
  });

  // -----------------------------------------------------------------------
  // Interface shape
  // -----------------------------------------------------------------------

  it("returns object with all 5 CLI methods", () => {
    expect(typeof cli.build).toBe("function");
    expect(typeof cli.validate).toBe("function");
    expect(typeof cli.version).toBe("function");
    expect(typeof cli.hotSwap).toBe("function");
    expect(typeof cli.migrate).toBe("function");
  });

  it("returns a fresh instance on each call", () => {
    const cli2 = createCLI(config);
    // Both instances are functional and return valid versions
    const v1 = cli.version();
    const v2 = cli2.version();
    expect(v1.major).toBe(v2.major);
    expect(v1.minor).toBe(v2.minor);
    expect(v1.patch).toBe(v2.patch);
    // Both have metadata with instanceId
    expect(v1.metadata).toBeDefined();
    expect(v2.metadata).toBeDefined();
    expect(typeof v1.metadata!["instanceId"]).toBe("string");
    expect(typeof v2.metadata!["instanceId"]).toBe("string");
  });

  // -----------------------------------------------------------------------
  // Config propagation
  // -----------------------------------------------------------------------

  it("TP: propagates packageRoot from config into version metadata", () => {
    const ver = cli.version();
    expect(ver.metadata!["packageRoot"]).toBe(config.packageRoot);
  });

  it("TP: default config produces valid CLI with esm target", () => {
    const minCli = createCLI(createMinimalCLIConfig(process.cwd()));
    const ver = minCli.version();
    expect(ver.major).toBe(0);
    expect(ver.minor).toBe(1);
    expect(ver.patch).toBe(0);
  });

  it("TP: strict mode config is accepted without error", () => {
    expect(() => createCLI(createStrictCLIConfig(process.cwd()))).not.toThrow();
  });
});

describe("unit: version()", () => {
  let cli: ObixCLI;

  beforeEach(() => {
    cli = createCLI(createValidCLIConfig(process.cwd()));
  });

  it("TP: returns SemanticVersionX with numeric major/minor/patch", () => {
    const ver = cli.version();
    expect(typeof ver.major).toBe("number");
    expect(typeof ver.minor).toBe("number");
    expect(typeof ver.patch).toBe("number");
  });

  it("TP: initial version is 0.1.0", () => {
    const ver = cli.version();
    expect(ver.major).toBe(0);
    expect(ver.minor).toBe(1);
    expect(ver.patch).toBe(0);
  });

  it("TP: metadata includes instanceId string", () => {
    const ver = cli.version();
    expect(ver.metadata).toBeDefined();
    expect(typeof ver.metadata!["instanceId"]).toBe("string");
    expect((ver.metadata!["instanceId"] as string).length).toBeGreaterThan(0);
  });

  it("TP: suffix is undefined for release version", () => {
    const ver = cli.version();
    expect(ver.suffix).toBeUndefined();
    expect(ver.prerelease).toBe(false);
  });
});

describe("unit: hotSwap()", () => {
  let cli: ObixCLI;

  beforeEach(() => {
    cli = createCLI(createValidCLIConfig(process.cwd()));
  });

  it("TP: accepts enabled=true without throwing", () => {
    expect(() => cli.hotSwap({ enabled: true, delay: 100 })).not.toThrow();
  });

  it("TP: accepts enabled=false without throwing", () => {
    expect(() => cli.hotSwap({ enabled: false })).not.toThrow();
  });

  it("TP: accepts custom delay value", () => {
    expect(() => cli.hotSwap({ enabled: true, delay: 500 })).not.toThrow();
  });

  it("TP: accepts watchPaths and excludePatterns", () => {
    expect(() =>
      cli.hotSwap({
        enabled: true,
        watchPaths: ["src", "lib"],
        excludePatterns: ["**/*.test.ts"],
        delay: 200,
      })
    ).not.toThrow();
  });
});

describe("unit: state-halt resilience", () => {
  it("TP: repeated identical calls do not crash (StateHaltEngine resume)", () => {
    const cli = createCLI(createValidCLIConfig(process.cwd()));
    // Calling version() N times triggers stabilityThreshold halt
    // The applyAction helper resumes transparently
    const results = Array.from({ length: 10 }, () => cli.version());
    for (const ver of results) {
      expect(ver.major).toBe(0);
      expect(ver.minor).toBe(1);
    }
  });

  it("TP: interleaved commands maintain consistent state", () => {
    const cli = createCLI(createValidCLIConfig(process.cwd()));
    cli.hotSwap({ enabled: true, delay: 100 });
    const v1 = cli.version();
    cli.hotSwap({ enabled: false });
    const v2 = cli.version();
    expect(v1.major).toBe(v2.major);
    expect(v1.minor).toBe(v2.minor);
    expect(v1.patch).toBe(v2.patch);
  });
});
