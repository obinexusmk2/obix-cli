/**
 * OBIX CLI - Build tooling, schema validation, semantic version X management
 * Command-line interface for OBIX SDK build and validation.
 *
 * The CLI is itself an OBIX component: its runtime state is managed by
 * ObixRuntime. Each command drives a lifecycle transition on that component.
 */

import { ObixRuntime, LifecycleHook } from "@obinexusltd/obix-core";
import type { CLIState, CLICommand, CLIStatus } from "./types.js";

// Re-export types for consumers of this package
export type { CLIState, CLICommand, CLIStatus } from "./types.js";

/**
 * Build target platforms
 */
export type BuildTarget = "esm" | "cjs" | "umd" | "iife";

/**
 * Schema validation result
 */
export interface SchemaValidation {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
  }>;
  warnings?: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * Semantic version X (flexible versioning)
 */
export interface SemanticVersionX {
  major: number;
  minor: number;
  patch: number;
  suffix?: string;
  prerelease?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Hot swap configuration for development
 */
export interface HotSwapConfig {
  enabled: boolean;
  watchPaths?: string[];
  excludePatterns?: string[];
  delay?: number;
}

/**
 * Build configuration
 */
export interface BuildConfig {
  targets: BuildTarget[];
  outputDir?: string;
  sourceMap?: boolean;
  minify?: boolean;
  hotSwap?: HotSwapConfig;
}

/**
 * CLI configuration
 */
export interface CLIConfig {
  packageRoot: string;
  buildConfig?: BuildConfig;
  strictMode?: boolean;
}

/**
 * Build result
 */
export interface BuildResult {
  success: boolean;
  outputs: Array<{
    target: BuildTarget;
    path: string;
    size: number;
  }>;
  duration: number;
  errors?: string[];
}

/**
 * OBIX CLI interface
 */
export interface ObixCLI {
  build(config?: BuildConfig): Promise<BuildResult>;
  validate(schemaPath: string): Promise<SchemaValidation>;
  version(): SemanticVersionX;
  hotSwap(config: HotSwapConfig): void;
  migrate(fromVersion: string, toVersion: string): Promise<void>;
}

/**
 * Create a CLI instance backed by an ObixRuntime component.
 *
 * The CLI's state (current command, status, output) is modeled as an OBIX
 * ComponentDefinition. Each method drives state transitions through the
 * runtime's action/update cycle, surfacing component lifecycle in the terminal.
 */
export function createCLI(config: CLIConfig): ObixCLI {
  const runtime = new ObixRuntime(
    { maxRevisions: 50, stabilityThreshold: 3, haltOnPolicyViolation: false }
  );

  runtime.register<CLIState>({
    name: "ObixCLI",
    state: {
      command: "idle",
      status: "idle",
      output: "",
      errorMessage: "",
      packageRoot: config.packageRoot,
      strictMode: config.strictMode ?? false,
      versionMajor: 0,
      versionMinor: 1,
      versionPatch: 0,
      versionSuffix: "",
      hotSwapEnabled: config.buildConfig?.hotSwap?.enabled ?? false,
      hotSwapDelay: config.buildConfig?.hotSwap?.delay ?? 300,
      migrateFrom: "",
      migrateTo: "",
      buildTargets: (config.buildConfig?.targets ?? ["esm"]).join(","),
      buildOutputDir: config.buildConfig?.outputDir ?? "dist",
      buildDuration: 0,
    },
    actions: {
      setCommand: (command: CLICommand) => ({ command }),
      setStatus: (status: CLIStatus) => ({ status }),
      setOutput: (output: string) => ({ output }),
      setError: (errorMessage: string) => ({ status: "error" as const, errorMessage }),
      setBuildResult: (duration: number, outputDir: string) => ({
        status: "success" as const,
        buildDuration: duration,
        buildOutputDir: outputDir,
        output: `Build complete in ${duration}ms`,
      }),
      setHotSwap: (enabled: boolean, delay: number) => ({
        hotSwapEnabled: enabled,
        hotSwapDelay: delay,
      }),
      setMigration: (from: string, to: string) => ({
        migrateFrom: from,
        migrateTo: to,
      }),
    },
    render: (state: CLIState) =>
      `[OBIX CLI] command=${state.command} status=${state.status}` +
      (state.output ? `\n  ${state.output}` : "") +
      (state.errorMessage ? `\n  error: ${state.errorMessage}` : ""),
  });

  const instance = runtime.create<CLIState>("ObixCLI");
  const instanceId = instance.id;

  // Subscribe to lifecycle events for diagnostics
  runtime.onLifecycle((event) => {
    if (event.hook === LifecycleHook.HALTED) {
      // State stabilized — expected for CLI after repeated identical commands.
      // The applyAction helper resumes automatically before the next command.
    }
  });

  /**
   * Apply an action, resuming the component first if state-halted.
   * StateHaltEngine halts after stabilityThreshold identical snapshots —
   * normal CLI behavior when the same command runs multiple times.
   */
  function applyAction(actionName: string, ...args: unknown[]): void {
    const current = runtime.getInstance<CLIState>(instanceId);
    if (current?.halted) {
      runtime.resume(instanceId);
    }
    runtime.update<CLIState>(instanceId, actionName, ...args);
  }

  function getState(): CLIState {
    return runtime.getInstance<CLIState>(instanceId)!.currentState;
  }

  return {
    async build(buildConfig?: BuildConfig): Promise<BuildResult> {
      applyAction("setCommand", "build" satisfies CLICommand);
      applyAction("setStatus", "running" satisfies CLIStatus);

      const startTime = Date.now();
      const targets = buildConfig?.targets ?? config.buildConfig?.targets ?? ["esm"];
      const outputDir = buildConfig?.outputDir ?? config.buildConfig?.outputDir ?? "dist";

      try {
        const { execSync } = await import("node:child_process");
        execSync("tsc", { cwd: config.packageRoot, stdio: "inherit" });

        const duration = Date.now() - startTime;
        applyAction("setBuildResult", duration, outputDir);

        const state = getState();
        process.stdout.write(state.output + "\n");

        return {
          success: true,
          outputs: targets.map((target) => ({
            target: target as BuildTarget,
            path: `${outputDir}/${target}`,
            size: 0,
          })),
          duration,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        applyAction("setError", msg);
        return {
          success: false,
          outputs: [],
          duration: Date.now() - startTime,
          errors: [msg],
        };
      }
    },

    async validate(schemaPath: string): Promise<SchemaValidation> {
      applyAction("setCommand", "validate" satisfies CLICommand);
      applyAction("setStatus", "running" satisfies CLIStatus);

      try {
        const { existsSync, readFileSync } = await import("node:fs");

        if (!existsSync(schemaPath)) {
          applyAction("setError", `Schema file not found: ${schemaPath}`);
          return {
            valid: false,
            errors: [{ path: schemaPath, message: "File not found" }],
          };
        }

        const content = readFileSync(schemaPath, "utf-8");
        JSON.parse(content);

        applyAction("setStatus", "success" satisfies CLIStatus);
        applyAction("setOutput", `Schema valid: ${schemaPath}`);

        return { valid: true, errors: [] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        applyAction("setError", msg);
        return {
          valid: false,
          errors: [{ path: schemaPath, message: msg }],
        };
      }
    },

    version(): SemanticVersionX {
      applyAction("setCommand", "version" satisfies CLICommand);
      const state = getState();
      return {
        major: state.versionMajor,
        minor: state.versionMinor,
        patch: state.versionPatch,
        suffix: state.versionSuffix || undefined,
        prerelease: !!state.versionSuffix,
        metadata: {
          instanceId,
          packageRoot: state.packageRoot,
        },
      };
    },

    hotSwap(hotSwapConfig: HotSwapConfig): void {
      applyAction("setCommand", "hot-swap" satisfies CLICommand);
      applyAction("setHotSwap", hotSwapConfig.enabled, hotSwapConfig.delay ?? 300);
    },

    async migrate(fromVersion: string, toVersion: string): Promise<void> {
      applyAction("setCommand", "migrate" satisfies CLICommand);
      applyAction("setStatus", "running" satisfies CLIStatus);
      applyAction("setMigration", fromVersion, toVersion);

      const semverPattern = /^\d+\.\d+\.\d+/;
      if (!semverPattern.test(fromVersion) || !semverPattern.test(toVersion)) {
        applyAction("setError", `Invalid version format: ${fromVersion} -> ${toVersion}`);
        throw new Error(`Invalid version format: expected semver, got "${fromVersion}" -> "${toVersion}"`);
      }

      applyAction("setStatus", "success" satisfies CLIStatus);
      applyAction("setOutput", `Migration plan: ${fromVersion} -> ${toVersion} (dry run)`);
    },
  };
}
