/**
 * HITL (Human-in-the-Loop) Test Fixtures
 *
 * Derived from the obix-polygaltic-demo project structure.
 * These fixtures model the rollup.config, tsconfig, package.json,
 * and component definitions used in real OBIX consumer projects,
 * enabling true-positive / false-positive / true-negative / false-negative
 * classification of CLI command outcomes.
 */

import type { CLIConfig, BuildConfig, HotSwapConfig } from "../../src/index.js";

// ---------------------------------------------------------------------------
// Fixture: valid polygaltic-demo project config (TP baseline)
// ---------------------------------------------------------------------------

export const VALID_PACKAGE_JSON = JSON.stringify({
  name: "obix-polygaltic-demo",
  version: "1.0.0",
  description: "OBIX polygaltic demo with LibPolyCall integration",
  main: "index.js",
  type: "commonjs",
  dependencies: {
    "@obinexusltd/obix": "^0.1.0",
    "@obinexusltd/obix-cli": "^0.1.1",
  },
  scripts: {
    test: 'echo "Error: no test specified" && exit 1',
  },
}, null, 2);

export const VALID_TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "node",
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    outDir: "dist",
    declaration: true,
  },
  include: ["src/**/*"],
  exclude: ["node_modules"],
}, null, 2);

export const VALID_ROLLUP_CONFIG = `
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from 'rollup-plugin-terser';

export default {
  input: 'src/index.ts',
  output: {
    file: 'public/bundle.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    nodeResolve({ browser: true }),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json' }),
    terser({ format: { comments: false } }),
  ],
  external: [],
};
`.trim();

export const VALID_SCHEMA = JSON.stringify({
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    name: { type: "string" },
    version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+" },
    components: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          state: { type: "object" },
        },
        required: ["name", "state"],
      },
    },
  },
  required: ["name", "version"],
}, null, 2);

// ---------------------------------------------------------------------------
// Fixture: malformed inputs (for FP / TN / FN classification)
// ---------------------------------------------------------------------------

export const MALFORMED_JSON = "{ this is not: valid json :::: }";

export const MALFORMED_SCHEMA = JSON.stringify({
  // Missing $schema, invalid type
  type: 12345,
  properties: "not an object",
});

export const EMPTY_JSON = "{}";

export const PARTIAL_TSCONFIG = JSON.stringify({
  compilerOptions: {
    // Missing target, module — should trigger warnings but may pass
    strict: true,
  },
});

// ---------------------------------------------------------------------------
// CLI config fixtures (mirrors obix-polygaltic-demo usage)
// ---------------------------------------------------------------------------

export function createValidCLIConfig(root: string): CLIConfig {
  return {
    packageRoot: root,
    strictMode: false,
    buildConfig: {
      targets: ["esm"],
      outputDir: "dist",
      sourceMap: true,
      minify: false,
    },
  };
}

export function createStrictCLIConfig(root: string): CLIConfig {
  return {
    packageRoot: root,
    strictMode: true,
    buildConfig: {
      targets: ["esm", "cjs"],
      outputDir: "dist",
      sourceMap: true,
      minify: true,
    },
  };
}

export function createMinimalCLIConfig(root: string): CLIConfig {
  return {
    packageRoot: root,
  };
}

// ---------------------------------------------------------------------------
// HITL classification helpers
// ---------------------------------------------------------------------------

/**
 * HITL QA Classification Matrix:
 *
 *   True Positive (TP):  CLI correctly succeeds on valid input
 *   False Positive (FP): CLI incorrectly succeeds on invalid input
 *   True Negative (TN):  CLI correctly rejects invalid input
 *   False Negative (FN): CLI incorrectly rejects valid input
 */
export type HITLClassification = "TP" | "FP" | "TN" | "FN";

export interface HITLTestCase {
  classification: HITLClassification;
  description: string;
  input: unknown;
  expectedOutcome: "success" | "failure";
}

export const HITL_VERSION_CASES: HITLTestCase[] = [
  {
    classification: "TP",
    description: "version() returns valid semver for default config",
    input: null,
    expectedOutcome: "success",
  },
  {
    classification: "TP",
    description: "version() includes instanceId metadata",
    input: null,
    expectedOutcome: "success",
  },
];

export const HITL_VALIDATE_CASES: HITLTestCase[] = [
  {
    classification: "TP",
    description: "validate() accepts well-formed JSON schema",
    input: VALID_SCHEMA,
    expectedOutcome: "success",
  },
  {
    classification: "TN",
    description: "validate() rejects malformed JSON",
    input: MALFORMED_JSON,
    expectedOutcome: "failure",
  },
  {
    classification: "TN",
    description: "validate() rejects non-existent file path",
    input: "/nonexistent/__obix_phantom__.json",
    expectedOutcome: "failure",
  },
  {
    classification: "TP",
    description: "validate() accepts empty but valid JSON object",
    input: EMPTY_JSON,
    expectedOutcome: "success",
  },
];

export const HITL_MIGRATE_CASES: HITLTestCase[] = [
  {
    classification: "TP",
    description: "migrate() accepts valid semver pair 0.1.0 -> 0.2.0",
    input: { from: "0.1.0", to: "0.2.0" },
    expectedOutcome: "success",
  },
  {
    classification: "TN",
    description: "migrate() rejects non-semver from-version",
    input: { from: "not-valid", to: "0.2.0" },
    expectedOutcome: "failure",
  },
  {
    classification: "TN",
    description: "migrate() rejects non-semver to-version",
    input: { from: "0.1.0", to: "latest" },
    expectedOutcome: "failure",
  },
  {
    classification: "TP",
    description: "migrate() handles patch-level 0.1.0 -> 0.1.1",
    input: { from: "0.1.0", to: "0.1.1" },
    expectedOutcome: "success",
  },
];

export const HITL_HOTSWAP_CASES: HITLTestCase[] = [
  {
    classification: "TP",
    description: "hotSwap() activates without error",
    input: { enabled: true, delay: 300 } satisfies HotSwapConfig,
    expectedOutcome: "success",
  },
  {
    classification: "TP",
    description: "hotSwap() deactivates without error",
    input: { enabled: false } satisfies HotSwapConfig,
    expectedOutcome: "success",
  },
];
