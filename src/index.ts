/**
 * OBIX CLI - Build tooling, schema validation, semantic version X management
 */

import { ObixRuntime, LifecycleHook } from "@obinexusltd/obix-sdk-core";
import type { LifecycleHandler } from "@obinexusltd/obix-sdk-core";
import type { CLIState, CLICommand, CLIStatus } from "./types.js";
import {
  compileSource,
  compileFile,
  compileProject,
  detectLoader,
  type CompileOptions,
  type CompileResult,
  type FileCompileResult,
  type CompileLoader,
} from "./compiler.js";
import {
  ComponentRegistry,
  buildRegistry,
  scanComponents,
  type RegistryEntry,
  type ComponentParadigm,
} from "./registry.js";

export type { CLIState, CLICommand, CLIStatus } from "./types.js";

export {
  compileSource,
  compileFile,
  compileProject,
  detectLoader,
  ComponentRegistry,
  buildRegistry,
  scanComponents,
};
export type {
  CompileOptions,
  CompileResult,
  FileCompileResult,
  CompileLoader,
  RegistryEntry,
  ComponentParadigm,
};

export type BuildTarget = "esm" | "cjs" | "umd" | "iife";

export interface SchemaValidation {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings?: Array<{ path: string; message: string }>;
}

export interface SemanticVersionX {
  major: number;
  minor: number;
  patch: number;
  suffix?: string;
  prerelease?: boolean;
  metadata?: Record<string, unknown>;
}

export interface HotSwapConfig {
  enabled: boolean;
  watchPaths?: string[];
  excludePatterns?: string[];
  delay?: number;
}

export interface BuildConfig {
  targets: BuildTarget[];
  outputDir?: string;
  sourceMap?: boolean;
  minify?: boolean;
  hotSwap?: HotSwapConfig;
}

export interface CLIConfig {
  packageRoot: string;
  buildConfig?: BuildConfig;
  strictMode?: boolean;
}

export interface BuildResult {
  success: boolean;
  outputs: Array<{ target: BuildTarget; path: string; size: number }>;
  duration: number;
  errors?: string[];
}

export interface CompileConfig {
  entry: string;
  outDir: string;
  module?: "esm" | "cjs";
  jsx?: "react" | "preserve" | "react-jsx";
  sourceMap?: boolean;
  buildRegistry?: boolean;
}

export interface CompileCLIResult {
  success: boolean;
  filesProcessed: number;
  filesFailed: number;
  duration: number;
  outputs: FileCompileResult[];
  registry?: RegistryEntry[];
  errors?: string[];
}

export interface ObixCLI {
  build(config?: BuildConfig): Promise<BuildResult>;
  compile(config: CompileConfig): Promise<CompileCLIResult>;
  validate(schemaPath: string): Promise<SchemaValidation>;
  version(): SemanticVersionX;
  hotSwap(config: HotSwapConfig): void;
  migrate(fromVersion: string, toVersion: string): Promise<void>;
}

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
      compileEntry: "",
      compileOutDir: "",
      compileFilesProcessed: 0,
      compileErrors: 0,
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
      setCompileResult: (
        entry: string,
        outDir: string,
        filesProcessed: number,
        errorCount: number
      ) => ({
        status: (errorCount === 0 ? "success" : "error") as CLIStatus,
        compileEntry: entry,
        compileOutDir: outDir,
        compileFilesProcessed: filesProcessed,
        compileErrors: errorCount,
        output: `Compiled ${filesProcessed} file(s), ${errorCount} error(s)`,
      }),
    },
    render: (state: CLIState) =>
      `[OBIX CLI] command=${state.command} status=${state.status}` +
      (state.output ? `\n  ${state.output}` : "") +
      (state.errorMessage ? `\n  error: ${state.errorMessage}` : ""),
  });

  const instance = runtime.create<CLIState>("ObixCLI");
  const instanceId = instance.id;

  runtime.onLifecycle((event: Parameters<LifecycleHandler>[0]) => {
    if (event.hook === LifecycleHook.HALTED) {
      // State stabilized
    }
  });

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

    async compile(compileConfig: CompileConfig): Promise<CompileCLIResult> {
      applyAction("setCommand", "compile" satisfies CLICommand);
      applyAction("setStatus", "running" satisfies CLIStatus);

      const startTime = Date.now();

      try {
        const { existsSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const entryAbs = resolve(config.packageRoot, compileConfig.entry);
        const outAbs = resolve(config.packageRoot, compileConfig.outDir);

        if (!existsSync(entryAbs)) {
          const msg = `compile entry not found: ${entryAbs}`;
          applyAction("setError", msg);
          return {
            success: false,
            filesProcessed: 0,
            filesFailed: 0,
            duration: Date.now() - startTime,
            outputs: [],
            errors: [msg],
          };
        }

        const outputs = await compileProject(entryAbs, outAbs, {
          module: compileConfig.module ?? "esm",
          jsx: compileConfig.jsx ?? "react",
          sourceMap: compileConfig.sourceMap ?? false,
        });

        const failed = outputs.filter((o) =>
          o.diagnostics.some((d) => d.category === "error")
        );

        let registry: RegistryEntry[] | undefined;
        if (compileConfig.buildRegistry) {
          const { readFile } = await import("node:fs/promises");
          const files = await Promise.all(
            outputs.map(async (o) => ({
              path: o.inputPath,
              source: await readFile(o.inputPath, "utf-8"),
            }))
          );
          registry = buildRegistry(files).all();
        }

        applyAction(
          "setCompileResult",
          entryAbs,
          outAbs,
          outputs.length,
          failed.length
        );

        return {
          success: failed.length === 0,
          filesProcessed: outputs.length,
          filesFailed: failed.length,
          duration: Date.now() - startTime,
          outputs,
          registry,
          errors: failed.flatMap((f) =>
            f.diagnostics
              .filter((d) => d.category === "error")
              .map((d) => `${f.inputPath}: ${d.message}`)
          ),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        applyAction("setError", msg);
        return {
          success: false,
          filesProcessed: 0,
          filesFailed: 0,
          duration: Date.now() - startTime,
          outputs: [],
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
