/**
 * OBIX CLI - Build tooling, schema validation, semantic version X management
 */
import { ObixRuntime, LifecycleHook } from "@obinexusltd/obix-sdk-core";
import { compileSource, compileFile, compileProject, detectLoader, } from "./compiler.js";
import { ComponentRegistry, buildRegistry, scanComponents, } from "./registry.js";
export { compileSource, compileFile, compileProject, detectLoader, ComponentRegistry, buildRegistry, scanComponents, };
export function createCLI(config) {
    const runtime = new ObixRuntime({ maxRevisions: 50, stabilityThreshold: 3, haltOnPolicyViolation: false });
    runtime.register({
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
            setCommand: (command) => ({ command }),
            setStatus: (status) => ({ status }),
            setOutput: (output) => ({ output }),
            setError: (errorMessage) => ({ status: "error", errorMessage }),
            setBuildResult: (duration, outputDir) => ({
                status: "success",
                buildDuration: duration,
                buildOutputDir: outputDir,
                output: `Build complete in ${duration}ms`,
            }),
            setHotSwap: (enabled, delay) => ({
                hotSwapEnabled: enabled,
                hotSwapDelay: delay,
            }),
            setMigration: (from, to) => ({
                migrateFrom: from,
                migrateTo: to,
            }),
            setCompileResult: (entry, outDir, filesProcessed, errorCount) => ({
                status: (errorCount === 0 ? "success" : "error"),
                compileEntry: entry,
                compileOutDir: outDir,
                compileFilesProcessed: filesProcessed,
                compileErrors: errorCount,
                output: `Compiled ${filesProcessed} file(s), ${errorCount} error(s)`,
            }),
        },
        render: (state) => `[OBIX CLI] command=${state.command} status=${state.status}` +
            (state.output ? `\n  ${state.output}` : "") +
            (state.errorMessage ? `\n  error: ${state.errorMessage}` : ""),
    });
    const instance = runtime.create("ObixCLI");
    const instanceId = instance.id;
    runtime.onLifecycle((event) => {
        if (event.hook === LifecycleHook.HALTED) {
            // State stabilized
        }
    });
    function applyAction(actionName, ...args) {
        const current = runtime.getInstance(instanceId);
        if (current?.halted) {
            runtime.resume(instanceId);
        }
        runtime.update(instanceId, actionName, ...args);
    }
    function getState() {
        return runtime.getInstance(instanceId).currentState;
    }
    return {
        async build(buildConfig) {
            applyAction("setCommand", "build");
            applyAction("setStatus", "running");
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
                        target: target,
                        path: `${outputDir}/${target}`,
                        size: 0,
                    })),
                    duration,
                };
            }
            catch (err) {
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
        async compile(compileConfig) {
            applyAction("setCommand", "compile");
            applyAction("setStatus", "running");
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
                const failed = outputs.filter((o) => o.diagnostics.some((d) => d.category === "error"));
                let registry;
                if (compileConfig.buildRegistry) {
                    const { readFile } = await import("node:fs/promises");
                    const files = await Promise.all(outputs.map(async (o) => ({
                        path: o.inputPath,
                        source: await readFile(o.inputPath, "utf-8"),
                    })));
                    registry = buildRegistry(files).all();
                }
                applyAction("setCompileResult", entryAbs, outAbs, outputs.length, failed.length);
                return {
                    success: failed.length === 0,
                    filesProcessed: outputs.length,
                    filesFailed: failed.length,
                    duration: Date.now() - startTime,
                    outputs,
                    registry,
                    errors: failed.flatMap((f) => f.diagnostics
                        .filter((d) => d.category === "error")
                        .map((d) => `${f.inputPath}: ${d.message}`)),
                };
            }
            catch (err) {
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
        async validate(schemaPath) {
            applyAction("setCommand", "validate");
            applyAction("setStatus", "running");
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
                applyAction("setStatus", "success");
                applyAction("setOutput", `Schema valid: ${schemaPath}`);
                return { valid: true, errors: [] };
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                applyAction("setError", msg);
                return {
                    valid: false,
                    errors: [{ path: schemaPath, message: msg }],
                };
            }
        },
        version() {
            applyAction("setCommand", "version");
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
        hotSwap(hotSwapConfig) {
            applyAction("setCommand", "hot-swap");
            applyAction("setHotSwap", hotSwapConfig.enabled, hotSwapConfig.delay ?? 300);
        },
        async migrate(fromVersion, toVersion) {
            applyAction("setCommand", "migrate");
            applyAction("setStatus", "running");
            applyAction("setMigration", fromVersion, toVersion);
            const semverPattern = /^\d+\.\d+\.\d+/;
            if (!semverPattern.test(fromVersion) || !semverPattern.test(toVersion)) {
                applyAction("setError", `Invalid version format: ${fromVersion} -> ${toVersion}`);
                throw new Error(`Invalid version format: expected semver, got "${fromVersion}" -> "${toVersion}"`);
            }
            applyAction("setStatus", "success");
            applyAction("setOutput", `Migration plan: ${fromVersion} -> ${toVersion} (dry run)`);
        },
    };
}
//# sourceMappingURL=index.js.map