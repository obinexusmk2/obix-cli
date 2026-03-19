/**
 * OBIX CLI - Build tooling, schema validation, semantic version X management
 * Command-line interface for OBIX SDK build and validation.
 *
 * The CLI is itself an OBIX component: its runtime state is managed by
 * ObixRuntime. Each command drives a lifecycle transition on that component.
 */
import { ObixRuntime, LifecycleHook } from "@obinexusltd/obix-core";
/**
 * Create a CLI instance backed by an ObixRuntime component.
 *
 * The CLI's state (current command, status, output) is modeled as an OBIX
 * ComponentDefinition. Each method drives state transitions through the
 * runtime's action/update cycle, surfacing component lifecycle in the terminal.
 */
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
        },
        render: (state) => `[OBIX CLI] command=${state.command} status=${state.status}` +
            (state.output ? `\n  ${state.output}` : "") +
            (state.errorMessage ? `\n  error: ${state.errorMessage}` : ""),
    });
    const instance = runtime.create("ObixCLI");
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