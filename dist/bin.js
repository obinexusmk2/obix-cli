#!/usr/bin/env node
/**
 * OBIX CLI Entry Point
 * The terminal heart/soul of the OBIX SDK.
 *
 * Usage:
 *   obix build [--target esm,cjs] [--out dist] [--map] [--minify]
 *   obix validate <schema-path>
 *   obix version
 *   obix hot-swap [--watch src] [--delay 300]
 *   obix migrate <from-version> <to-version>
 *   obix help
 */
import { createCLI } from "./index.js";
// ---------------------------------------------------------------------------
// Minimal argv parser — no external dependencies
// Handles: --flag value, --flag=value, boolean --flag, positional args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
    const args = argv.slice(2);
    const command = args[0] ?? "help";
    const positional = [];
    const flags = {};
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith("--")) {
            const eqIndex = arg.indexOf("=");
            if (eqIndex !== -1) {
                flags[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
            }
            else {
                const key = arg.slice(2);
                const next = args[i + 1];
                if (next !== undefined && !next.startsWith("--")) {
                    flags[key] = next;
                    i++;
                }
                else {
                    flags[key] = true;
                }
            }
        }
        else {
            positional.push(arg);
        }
    }
    return { command, positional, flags };
}
// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------
const HELP_TEXT = `
OBIX CLI — Heart/Soul SDK build tooling and schema validation
Version: 0.1.0

USAGE
  obix <command> [options]

COMMANDS
  build       Compile the OBIX project (runs tsc)
  validate    Validate a JSON schema file
  version     Show version information
  hot-swap    Enable file-watching hot swap for development
  migrate     Generate migration plan between SDK versions
  help        Show this help message

BUILD OPTIONS
  --target    Comma-separated build targets (default: esm)
              Supported: esm, cjs, umd, iife
  --out       Output directory (default: dist)
  --map       Enable source maps
  --minify    Minify output

VALIDATE OPTIONS
  <path>      Path to JSON schema file (required)

HOT-SWAP OPTIONS
  --watch     Comma-separated paths to watch (default: src)
  --delay     Debounce delay in ms (default: 300)

MIGRATE OPTIONS
  <from>      Source version (e.g. 0.1.0)
  <to>        Target version (e.g. 0.2.0)

GLOBAL OPTIONS
  --root      Package root directory (default: cwd)
  --strict    Enable strict mode

EXAMPLES
  obix build --target esm,cjs --out dist
  obix validate ./schema/component.json
  obix version
  obix hot-swap --watch src,lib --delay 500
  obix migrate 0.1.0 0.2.0
`.trimStart();
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const { command, positional, flags } = parseArgs(process.argv);
    const packageRoot = typeof flags["root"] === "string" ? flags["root"] : process.cwd();
    const cliConfig = {
        packageRoot,
        strictMode: flags["strict"] === true,
        buildConfig: {
            targets: typeof flags["target"] === "string"
                ? flags["target"].split(",")
                : ["esm"],
            outputDir: typeof flags["out"] === "string" ? flags["out"] : "dist",
            sourceMap: flags["map"] === true,
            minify: flags["minify"] === true,
        },
    };
    const cli = createCLI(cliConfig);
    switch (command) {
        case "build": {
            const buildConfig = {
                targets: cliConfig.buildConfig.targets,
                outputDir: cliConfig.buildConfig.outputDir,
                sourceMap: cliConfig.buildConfig.sourceMap,
                minify: cliConfig.buildConfig.minify,
            };
            const result = await cli.build(buildConfig);
            if (!result.success) {
                process.stderr.write(`Build failed:\n${(result.errors ?? []).join("\n")}\n`);
                process.exit(1);
            }
            process.stdout.write(`Build succeeded in ${result.duration}ms\n`);
            for (const output of result.outputs) {
                process.stdout.write(`  [${output.target}] -> ${output.path}\n`);
            }
            break;
        }
        case "validate": {
            const schemaPath = positional[0];
            if (!schemaPath) {
                process.stderr.write("validate requires a schema path argument\nUsage: obix validate <schema-path>\n");
                process.exit(1);
            }
            const result = await cli.validate(schemaPath);
            if (!result.valid) {
                process.stderr.write("Validation failed:\n");
                for (const err of result.errors) {
                    process.stderr.write(`  ${err.path}: ${err.message}\n`);
                }
                process.exit(1);
            }
            process.stdout.write(`Schema is valid: ${schemaPath}\n`);
            break;
        }
        case "version": {
            const ver = cli.version();
            const vStr = `${ver.major}.${ver.minor}.${ver.patch}${ver.suffix ? `-${ver.suffix}` : ""}`;
            process.stdout.write(`obix v${vStr}\n`);
            break;
        }
        case "hot-swap": {
            const watchPaths = typeof flags["watch"] === "string"
                ? flags["watch"].split(",")
                : ["src"];
            const delay = typeof flags["delay"] === "string"
                ? parseInt(flags["delay"], 10)
                : 300;
            const hotSwapConfig = {
                enabled: true,
                watchPaths,
                delay,
            };
            cli.hotSwap(hotSwapConfig);
            const { watch } = await import("node:fs");
            process.stdout.write(`Watching: ${watchPaths.join(", ")} (delay: ${delay}ms)\n`);
            let debounceTimer = null;
            for (const watchPath of watchPaths) {
                watch(watchPath, { recursive: true }, (_eventType, filename) => {
                    if (debounceTimer !== null)
                        clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(async () => {
                        process.stdout.write(`[hot-swap] Change detected: ${filename ?? "unknown"}\n`);
                        const result = await cli.build();
                        if (result.success) {
                            process.stdout.write(`[hot-swap] Rebuild complete in ${result.duration}ms\n`);
                        }
                        else {
                            process.stderr.write("[hot-swap] Rebuild failed\n");
                        }
                    }, delay);
                });
            }
            process.stdout.write("Hot swap active. Press Ctrl+C to stop.\n");
            break;
        }
        case "migrate": {
            const fromVersion = positional[0];
            const toVersion = positional[1];
            if (!fromVersion || !toVersion) {
                process.stderr.write("migrate requires two version arguments\nUsage: obix migrate <from-version> <to-version>\n");
                process.exit(1);
            }
            await cli.migrate(fromVersion, toVersion);
            process.stdout.write(`Migration plan generated: ${fromVersion} -> ${toVersion}\n`);
            break;
        }
        case "help":
        default: {
            process.stdout.write(HELP_TEXT);
            break;
        }
    }
}
main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[obix] fatal error: ${msg}\n`);
    process.exit(1);
});
//# sourceMappingURL=bin.js.map