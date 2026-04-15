/**
 * Unit Tests — validate() command
 *
 * HITL QA matrix for schema validation against polygaltic-demo fixtures.
 *
 *   TP: validate() correctly accepts valid JSON
 *   FP: validate() incorrectly accepts malformed input
 *   TN: validate() correctly rejects invalid input
 *   FN: validate() incorrectly rejects valid input
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCLI, type ObixCLI } from "../../src/index.js";
import {
  createValidCLIConfig,
  VALID_SCHEMA,
  VALID_PACKAGE_JSON,
  VALID_TSCONFIG,
  MALFORMED_JSON,
  MALFORMED_SCHEMA,
  EMPTY_JSON,
} from "../fixtures/index.js";

describe("unit: validate()", () => {
  let cli: ObixCLI;
  let tmpDir: string;
  const tempFiles: string[] = [];

  function writeTempFile(name: string, content: string): string {
    const filePath = join(tmpDir, name);
    writeFileSync(filePath, content, "utf-8");
    tempFiles.push(filePath);
    return filePath;
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "obix-cli-test-"));
    cli = createCLI(createValidCLIConfig(tmpDir));
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch { /* already removed */ }
    }
    tempFiles.length = 0;
  });

  // -----------------------------------------------------------------------
  // True Positives — valid input accepted
  // -----------------------------------------------------------------------

  it("TP: accepts well-formed JSON schema", async () => {
    const path = writeTempFile("valid-schema.json", VALID_SCHEMA);
    const result = await cli.validate(path);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("TP: accepts valid package.json (polygaltic-demo fixture)", async () => {
    const path = writeTempFile("package.json", VALID_PACKAGE_JSON);
    const result = await cli.validate(path);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("TP: accepts valid tsconfig.json (polygaltic-demo fixture)", async () => {
    const path = writeTempFile("tsconfig.json", VALID_TSCONFIG);
    const result = await cli.validate(path);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("TP: accepts empty JSON object", async () => {
    const path = writeTempFile("empty.json", EMPTY_JSON);
    const result = await cli.validate(path);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("TP: accepts JSON array", async () => {
    const path = writeTempFile("array.json", "[1, 2, 3]");
    const result = await cli.validate(path);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // True Negatives — invalid input correctly rejected
  // -----------------------------------------------------------------------

  it("TN: rejects non-existent file path", async () => {
    const result = await cli.validate("/nonexistent/__obix_phantom__.json");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("not found");
  });

  it("TN: rejects malformed JSON content", async () => {
    const path = writeTempFile("bad.json", MALFORMED_JSON);
    const result = await cli.validate(path);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("TN: rejects file with trailing garbage after valid JSON", async () => {
    const path = writeTempFile("trailing.json", '{"valid": true} GARBAGE');
    const result = await cli.validate(path);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Edge cases — boundary between TP and FP
  // -----------------------------------------------------------------------

  it("TP: accepts JSON with unicode content", async () => {
    const path = writeTempFile("unicode.json", JSON.stringify({ name: "OBIX 日本語テスト" }));
    const result = await cli.validate(path);
    expect(result.valid).toBe(true);
  });

  it("TP: accepts deeply nested but valid JSON", async () => {
    const nested = { a: { b: { c: { d: { e: "deep" } } } } };
    const path = writeTempFile("nested.json", JSON.stringify(nested));
    const result = await cli.validate(path);
    expect(result.valid).toBe(true);
  });

  it("TP: accepts malformed schema structure as valid JSON (parse-only)", async () => {
    // MALFORMED_SCHEMA is valid JSON (parseable) even though its schema
    // structure is semantically wrong. validate() only checks JSON parse.
    const path = writeTempFile("bad-schema.json", MALFORMED_SCHEMA);
    const result = await cli.validate(path);
    // This is a TP because the CLI's validate command only parses JSON —
    // semantic schema validation is a separate concern.
    expect(result.valid).toBe(true);
  });
});
