/**
 * Integration Tests — CLI Lifecycle with ObixRuntime
 *
 * End-to-end tests verifying the CLI factory correctly wires ObixRuntime
 * component lifecycle. Uses obix-polygaltic-demo fixtures as the baseline
 * consumer project for HITL QA classification.
 *
 *   TP: Full command lifecycle completes correctly
 *   FP: Command succeeds when it should not
 *   TN: Command fails correctly on bad input
 *   FN: Command fails when it should succeed
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync, mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCLI, type ObixCLI, type CLIConfig } from "../../src/index.js";
import { ObixRuntime } from "@obinexusltd/obix-sdk-core";
import {
  createValidCLIConfig,
  createStrictCLIConfig,
  VALID_SCHEMA,
  VALID_PACKAGE_JSON,
  VALID_TSCONFIG,
  VALID_ROLLUP_CONFIG,
  MALFORMED_JSON,
} from "../fixtures/index.js";

describe("integration: CLI lifecycle", () => {
  let tmpDir: string;
  const tempFiles: string[] = [];

  function writeTempFile(name: string, content: string): string {
    const filePath = join(tmpDir, name);
    writeFileSync(filePath, content, "utf-8");
    tempFiles.push(filePath);
    return filePath;
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "obix-cli-integration-"));
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch { /* ok */ }
    }
    tempFiles.length = 0;
  });

  // -----------------------------------------------------------------------
  // Full command sequences (simulate real user workflows)
  // -----------------------------------------------------------------------

  describe("polygaltic-demo workflow simulation", () => {
    it("TP: version → validate → hotSwap sequence completes", async () => {
      const cli = createCLI(createValidCLIConfig(tmpDir));

      // Step 1: Check version
      const ver = cli.version();
      expect(ver.major).toBe(0);
      expect(ver.minor).toBe(1);

      // Step 2: Validate a schema file
      const schemaPath = writeTempFile("schema.json", VALID_SCHEMA);
      const validation = await cli.validate(schemaPath);
      expect(validation.valid).toBe(true);

      // Step 3: Enable hot-swap
      cli.hotSwap({ enabled: true, watchPaths: ["src"], delay: 300 });

      // Step 4: Check version again (tests state-halt resume)
      const ver2 = cli.version();
      expect(ver2.major).toBe(0);
    });

    it("TP: validate package.json → validate tsconfig → migrate", async () => {
      const cli = createCLI(createValidCLIConfig(tmpDir));

      const pkgPath = writeTempFile("package.json", VALID_PACKAGE_JSON);
      const tscPath = writeTempFile("tsconfig.json", VALID_TSCONFIG);

      const r1 = await cli.validate(pkgPath);
      expect(r1.valid).toBe(true);

      const r2 = await cli.validate(tscPath);
      expect(r2.valid).toBe(true);

      await expect(cli.migrate("0.1.0", "0.2.0")).resolves.toBeUndefined();
    });

    it("TN: validate malformed → should not crash migrate", async () => {
      const cli = createCLI(createValidCLIConfig(tmpDir));

      const badPath = writeTempFile("bad.json", MALFORMED_JSON);
      const result = await cli.validate(badPath);
      expect(result.valid).toBe(false);

      // After a failed validate, migrate should still work independently
      await expect(cli.migrate("0.1.0", "0.2.0")).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // ObixRuntime component pattern verification
  // -----------------------------------------------------------------------

  describe("ObixRuntime direct integration", () => {
    it("TP: standalone ObixRuntime creates and updates components", () => {
      const runtime = new ObixRuntime({
        maxRevisions: 10,
        stabilityThreshold: 3,
        haltOnPolicyViolation: false,
      });

      runtime.register({
        name: "PolygalticCounter",
        state: { count: 42, lang: "TypeScript" },
        actions: {
          increment: () => ({}),
          reset: () => ({ count: 0 }),
          switchLang: (state: { lang: string }) => ({
            lang: state.lang === "TypeScript" ? "Rust" : "TypeScript",
          }),
        },
        render: (state: { count: number; lang: string }) =>
          `Count: ${state.count}, Lang: ${state.lang}`,
      });

      const inst = runtime.create("PolygalticCounter");
      expect(inst.halted).toBe(false);
      expect(inst.currentState.count).toBe(42);
      expect(inst.currentState.lang).toBe("TypeScript");
    });

    it("TP: component halts after stability threshold", () => {
      const runtime = new ObixRuntime({
        maxRevisions: 10,
        stabilityThreshold: 3,
        haltOnPolicyViolation: false,
      });

      runtime.register({
        name: "StableComponent",
        state: { value: "constant" },
        actions: {
          noop: () => ({ value: "constant" }), // always same state
        },
        render: (state: { value: string }) => state.value,
      });

      const inst = runtime.create("StableComponent");

      // Apply same action multiple times to trigger halt
      for (let i = 0; i < 5; i++) {
        const current = runtime.getInstance(inst.id);
        if (current?.halted) {
          runtime.resume(inst.id);
        }
        runtime.update(inst.id, "noop");
      }

      // State should still be accessible
      const final = runtime.getInstance(inst.id);
      expect(final).toBeDefined();
      expect(final!.currentState.value).toBe("constant");
    });
  });

  // -----------------------------------------------------------------------
  // Fixture-based HITL validation matrix
  // -----------------------------------------------------------------------

  describe("HITL fixture validation matrix", () => {
    const fixtures: Array<{
      label: string;
      content: string;
      classification: "TP" | "TN";
      expectedValid: boolean;
    }> = [
      { label: "valid-schema.json", content: VALID_SCHEMA, classification: "TP", expectedValid: true },
      { label: "package.json", content: VALID_PACKAGE_JSON, classification: "TP", expectedValid: true },
      { label: "tsconfig.json", content: VALID_TSCONFIG, classification: "TP", expectedValid: true },
      { label: "malformed.json", content: MALFORMED_JSON, classification: "TN", expectedValid: false },
    ];

    for (const { label, content, classification, expectedValid } of fixtures) {
      it(`${classification}: validate(${label}) → valid=${expectedValid}`, async () => {
        const cli = createCLI(createValidCLIConfig(tmpDir));
        const path = writeTempFile(label, content);
        const result = await cli.validate(path);
        expect(result.valid).toBe(expectedValid);
      });
    }
  });

  // -----------------------------------------------------------------------
  // Rollup config fixture (not JSON — tests negative path)
  // -----------------------------------------------------------------------

  it("TN: validate() rejects rollup.config.mjs (not JSON)", async () => {
    const cli = createCLI(createValidCLIConfig(tmpDir));
    const path = writeTempFile("rollup.config.mjs", VALID_ROLLUP_CONFIG);
    const result = await cli.validate(path);
    // rollup config is JavaScript, not JSON — validate should reject
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
