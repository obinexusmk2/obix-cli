/**
 * Unit Tests — migrate() command
 *
 * HITL QA matrix for version migration.
 *
 *   TP: migrate() succeeds on valid semver pair
 *   TN: migrate() rejects invalid semver strings
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createCLI, type ObixCLI } from "../../src/index.js";
import {
  createValidCLIConfig,
  HITL_MIGRATE_CASES,
} from "../fixtures/index.js";

describe("unit: migrate()", () => {
  let cli: ObixCLI;

  beforeEach(() => {
    cli = createCLI(createValidCLIConfig(process.cwd()));
  });

  // -----------------------------------------------------------------------
  // True Positives — valid semver accepted
  // -----------------------------------------------------------------------

  it("TP: resolves for valid semver pair 0.1.0 -> 0.2.0", async () => {
    await expect(cli.migrate("0.1.0", "0.2.0")).resolves.toBeUndefined();
  });

  it("TP: resolves for patch-level migration 0.1.0 -> 0.1.1", async () => {
    await expect(cli.migrate("0.1.0", "0.1.1")).resolves.toBeUndefined();
  });

  it("TP: resolves for major version bump 1.0.0 -> 2.0.0", async () => {
    await expect(cli.migrate("1.0.0", "2.0.0")).resolves.toBeUndefined();
  });

  it("TP: resolves for same version (no-op migration)", async () => {
    await expect(cli.migrate("0.1.0", "0.1.0")).resolves.toBeUndefined();
  });

  it("TP: resolves for pre-release suffix like 1.0.0-alpha", async () => {
    // The regex /^\d+\.\d+\.\d+/ matches the leading semver
    await expect(cli.migrate("1.0.0-alpha", "1.0.0")).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // True Negatives — invalid semver rejected
  // -----------------------------------------------------------------------

  it("TN: throws on non-semver from-version", async () => {
    await expect(cli.migrate("not-valid", "0.2.0")).rejects.toThrow();
  });

  it("TN: throws on non-semver to-version", async () => {
    await expect(cli.migrate("0.1.0", "latest")).rejects.toThrow();
  });

  it("TN: throws on empty string from-version", async () => {
    await expect(cli.migrate("", "0.2.0")).rejects.toThrow();
  });

  it("TN: throws on empty string to-version", async () => {
    await expect(cli.migrate("0.1.0", "")).rejects.toThrow();
  });

  it("TN: throws on version with only major.minor (no patch)", async () => {
    await expect(cli.migrate("0.1", "0.2")).rejects.toThrow();
  });

  // -----------------------------------------------------------------------
  // HITL data-driven tests
  // -----------------------------------------------------------------------

  describe("HITL migrate cases", () => {
    for (const testCase of HITL_MIGRATE_CASES) {
      const { classification, description, input, expectedOutcome } = testCase;
      const { from, to } = input as { from: string; to: string };

      it(`${classification}: ${description}`, async () => {
        if (expectedOutcome === "success") {
          await expect(cli.migrate(from, to)).resolves.toBeUndefined();
        } else {
          await expect(cli.migrate(from, to)).rejects.toThrow();
        }
      });
    }
  });
});
