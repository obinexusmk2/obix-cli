# @obinexusltd/obix-cli

OBIX CLI — build tooling, schema validation, and semantic version X management for the OBIX SDK.

## Overview

The CLI is itself an OBIX component. Its runtime state is managed by `ObixRuntime` from `@obinexusltd/obix-core` — each command drives a lifecycle transition (CREATED → UPDATED → HALTED) on that component. This embodies the OBIX "heart UI and UX" philosophy: the terminal interface surfaces the same component lifecycle concepts as the rest of the SDK.

## Installation

```bash
# Within the OBIX monorepo (workspace link)
npm install

# Global install for standalone use
npm install -g @obinexusltd/obix-cli
```

After install, the `obix` command is available (or `obix.cmd` on Windows via npm's automatic shim).

## Commands

```
obix build       Compile the project (runs tsc)
obix validate    Validate a JSON schema file
obix version     Show version information
obix hot-swap    Watch files and rebuild on change
obix migrate     Generate a migration plan between SDK versions
obix help        Show help
```

### `obix build`

```bash
obix build [--target esm,cjs] [--out dist] [--map] [--minify]
```

Runs `tsc` in the package root. Targets are informational (the actual multi-target compilation is driven by your `tsconfig.json`).

| Flag | Default | Description |
|------|---------|-------------|
| `--target` | `esm` | Comma-separated build targets: `esm`, `cjs`, `umd`, `iife` |
| `--out` | `dist` | Output directory |
| `--map` | `false` | Enable source maps |
| `--minify` | `false` | Minify output |

### `obix validate`

```bash
obix validate <schema-path>
```

Validates that a file exists and contains well-formed JSON. Exits with code `1` on failure.

### `obix version`

```bash
obix version
```

Prints the current Semantic Version X (`major.minor.patch[-suffix]`).

### `obix hot-swap`

```bash
obix hot-swap [--watch src,lib] [--delay 300]
```

Watches paths with `fs.watch` and triggers a rebuild on change. Keeps the process alive until `Ctrl+C`.

| Flag | Default | Description |
|------|---------|-------------|
| `--watch` | `src` | Comma-separated paths to watch |
| `--delay` | `300` | Debounce delay in milliseconds |

### `obix migrate`

```bash
obix migrate <from-version> <to-version>
```

Generates a dry-run migration plan between two semver versions. Both arguments must be valid semver (e.g. `0.1.0`).

## Global Options

| Flag | Description |
|------|-------------|
| `--root` | Package root directory (default: `cwd`) |
| `--strict` | Enable strict mode |

## Programmatic API

```typescript
import { createCLI } from "@obinexusltd/obix-cli";

const cli = createCLI({
  packageRoot: process.cwd(),
  buildConfig: { targets: ["esm", "cjs"], outputDir: "dist" },
});

// Each method drives an ObixRuntime component state transition
const result = await cli.build();
const ver = cli.version();        // { major: 0, minor: 1, patch: 0 }
await cli.migrate("0.1.0", "0.2.0");
```

## Architecture

```
src/
  bin.ts       Executable entry point (#!/usr/bin/env node)
  index.ts     createCLI() factory — ObixRuntime-backed implementation
  types.ts     CLIState interface (flat, depth-1 for policy compliance)
```

The `CLIState` is intentionally flat (all primitive fields) to satisfy `obix-core`'s `MaxStateDepth` policy and enable `StateHaltEngine` stability detection. When state stabilizes after repeated identical commands, `createCLI()` automatically resumes the component before the next action.

## License

MIT — OBINexus &lt;okpalan@protonmail.com&gt;
# obix-sdk-cli
