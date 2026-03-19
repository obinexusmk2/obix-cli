/**
 * OBIX CLI Integration Tests
 *
 * Verifies that createCLI() correctly wires an ObixRuntime component and
 * that each CLI command drives the component through state transitions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createCLI, type CLIConfig } from "../src/index.js";
import { ObixRuntime } from "@obinexusltd/obix-core";

describe("obix-cli integration", () => {
  let config: CLIConfig;

  beforeEach(() => {
    config = {
      packageRoot: process.cwd(),
      strictMode: false,
      buildConfig: {
        targets: ["esm"],
        outputDir: "dist",
      },
    };
  });

  it("returns an ObixCLI instance with all 5 methods", () => {
    const cli = createCLI(config);
    expect(typeof cli.build).toBe("function");
    expect(typeof cli.validate).toBe("function");
    expect(typeof cli.version).toBe("function");
    expect(typeof cli.hotSwap).toBe("function");
    expect(typeof cli.migrate).toBe("function");
  });

  describe("version()", () => {
    it("returns SemanticVersionX with numeric fields", () => {
      const cli = createCLI(config);
      const ver = cli.version();
      expect(typeof ver.major).toBe("number");
      expect(typeof ver.minor).toBe("number");
      expect(typeof ver.patch).toBe("number");
    });

    it("returns initial version 0.1.0", () => {
      const cli = createCLI(config);
      const ver = cli.version();
      expect(ver.major).toBe(0);
      expect(ver.minor).toBe(1);
      expect(ver.patch).toBe(0);
    });

    it("includes instanceId in metadata", () => {
      const cli = createCLI(config);
      const ver = cli.version();
      expect(ver.metadata).toBeDefined();
      expect(typeof ver.metadata!["instanceId"]).toBe("string");
    });

    it("reflects packageRoot from config", () => {
      const cli = createCLI(config);
      const ver = cli.version();
      expect(ver.metadata!["packageRoot"]).toBe(config.packageRoot);
    });
  });

  describe("validate()", () => {
    it("returns invalid for a non-existent file path", async () => {
      const cli = createCLI(config);
      const result = await cli.validate("/nonexistent/__obix_test_schema__.json");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("not found");
    });

    it("returns invalid for malformed JSON content", async () => {
      // Write a temp file with bad JSON, then validate it
      const { writeFileSync, unlinkSync } = await import("node:fs");
      const tmpPath = `${process.cwd()}/__obix_bad_json_test__.json`;
      writeFileSync(tmpPath, "{ bad json ::::", "utf-8");
      try {
        const cli = createCLI(config);
        const result = await cli.validate(tmpPath);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      } finally {
        unlinkSync(tmpPath);
      }
    });

    it("returns valid for well-formed JSON", async () => {
      const { writeFileSync, unlinkSync } = await import("node:fs");
      const tmpPath = `${process.cwd()}/__obix_valid_json_test__.json`;
      writeFileSync(tmpPath, JSON.stringify({ name: "test", version: "0.1.0" }), "utf-8");
      try {
        const cli = createCLI(config);
        const result = await cli.validate(tmpPath);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      } finally {
        unlinkSync(tmpPath);
      }
    });
  });

  describe("hotSwap()", () => {
    it("does not throw when called with enabled: true", () => {
      const cli = createCLI(config);
      expect(() => cli.hotSwap({ enabled: true, delay: 100 })).not.toThrow();
    });

    it("does not throw when called with enabled: false", () => {
      const cli = createCLI(config);
      expect(() => cli.hotSwap({ enabled: false })).not.toThrow();
    });
  });

  describe("migrate()", () => {
    it("throws on non-semver from-version", async () => {
      const cli = createCLI(config);
      await expect(cli.migrate("not-valid", "0.2.0")).rejects.toThrow();
    });

    it("throws on non-semver to-version", async () => {
      const cli = createCLI(config);
      await expect(cli.migrate("0.1.0", "not-valid")).rejects.toThrow();
    });

    it("resolves successfully for valid semver pair", async () => {
      const cli = createCLI(config);
      await expect(cli.migrate("0.1.0", "0.2.0")).resolves.toBeUndefined();
    });

    it("resolves for patch-level migration", async () => {
      const cli = createCLI(config);
      await expect(cli.migrate("0.1.0", "0.1.1")).resolves.toBeUndefined();
    });
  });

  describe("ObixRuntime component pattern", () => {
    it("CLI state transitions are valid OBIX component interactions", () => {
      // Verify the underlying pattern works independently
      const runtime = new ObixRuntime({
        maxRevisions: 10,
        stabilityThreshold: 3,
        haltOnPolicyViolation: false,
      });

      runtime.register({
        name: "TestCLI",
        state: { command: "idle", status: "idle", output: "" },
        actions: {
          setCommand: (command: string) => ({ command }),
          setOutput: (output: string) => ({ output }),
        },
        render: (state) => `[CLI] ${state.command}: ${state.output}`,
      });

      const inst = runtime.create("TestCLI");
      expect(inst.halted).toBe(false);
      expect(inst.currentState.command).toBe("idle");

      runtime.update(inst.id, "setCommand", "build");
      const updated = runtime.getInstance(inst.id);
      expect(updated?.currentState.command).toBe("build");
    });

    it("multiple commands on same CLI instance share component state", () => {
      const cli = createCLI(config);
      // hotSwap is synchronous — transitions component state
      cli.hotSwap({ enabled: true, delay: 200 });
      // version is synchronous — reads component state, same instance
      const ver = cli.version();
      expect(ver.major).toBe(0);
      expect(ver.minor).toBe(1);
    });

    it("resume-and-act pattern works across repeated identical calls", () => {
      const cli = createCLI(config);
      // Calling version() three times would trigger StateHaltEngine stabilization
      // The applyAction helper must resume the component transparently
      const v1 = cli.version();
      const v2 = cli.version();
      const v3 = cli.version();
      expect(v1.major).toBe(v2.major);
      expect(v2.major).toBe(v3.major);
    });
  });
});
