/**
 * OBIX JSX/TSX Compiler
 * ---------------------
 * Zero-runtime-dependency JSX/TSX → JS transpiler powered by the TypeScript
 * compiler API. Produces browser-compatible ESM suitable for bundling with
 * any downstream bundler (Vite, Rollup, esbuild) OR direct script loading
 * through `obix hot-swap`.
 *
 * Supported inputs:  `*.jsx`, `*.tsx`, `*.ts`, `*.js`
 * Supported targets: ES2020..ES2022 ESM / CJS
 *
 * The compiler is paradigm-agnostic: it preserves React.createElement() calls
 * (via `jsx: react` emit) so downstream OBIX adapters (`ObixReactAdapter`,
 * `obix-jsx-react`) can intercept and route into `ObixRuntime`.
 */

import type { BuildTarget } from "./index.js";

// TypeScript is loaded lazily so unit tests that never touch the compiler
// pay no cold-start cost.
type TSModule = typeof import("typescript");
let _tsCache: TSModule | null = null;

async function loadTS(): Promise<TSModule> {
  if (_tsCache) return _tsCache;
  // Default import for ESM, fall back to namespace import otherwise.
  const mod: { default?: TSModule } & TSModule = await import("typescript");
  _tsCache = (mod.default ?? mod) as TSModule;
  return _tsCache;
}

/**
 * Loader classification for an input path.
 */
export type CompileLoader = "jsx" | "tsx" | "ts" | "js";

export function detectLoader(filePath: string): CompileLoader {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".jsx")) return "jsx";
  if (lower.endsWith(".ts")) return "ts";
  return "js";
}

export interface CompileOptions {
  /** Source-file path (used for source maps and loader detection). */
  fileName: string;
  /** Target module system. */
  module?: "esm" | "cjs";
  /** ECMAScript target. */
  target?: BuildTarget | "es2020" | "es2021" | "es2022";
  /** Emit JSX: "react" produces React.createElement calls. */
  jsx?: "react" | "preserve" | "react-jsx";
  /** Emit a sourcemap file (returned in `map`). */
  sourceMap?: boolean;
  /** Explicit loader override (otherwise detected from fileName). */
  loader?: CompileLoader;
}

export interface CompileResult {
  /** Transpiled JavaScript output. */
  code: string;
  /** Inline / external sourcemap JSON string, if requested. */
  map?: string;
  /** Diagnostic messages emitted during transpilation. */
  diagnostics: Array<{ code: number; message: string; category: "error" | "warning" | "info" }>;
  /** Detected / effective loader. */
  loader: CompileLoader;
}

/**
 * Compile a single JSX/TSX/TS/JS source string to JavaScript.
 *
 * This is the lowest-level primitive. It is synchronous-at-the-API-level but
 * must load `typescript` once (cached after first call).
 */
export async function compileSource(
  source: string,
  options: CompileOptions
): Promise<CompileResult> {
  const ts = await loadTS();

  const loader = options.loader ?? detectLoader(options.fileName);
  const emitJSX = loader === "jsx" || loader === "tsx";

  const targetMap: Record<string, number> = {
    esm: ts.ScriptTarget.ES2022,
    es2020: ts.ScriptTarget.ES2020,
    es2021: ts.ScriptTarget.ES2021,
    es2022: ts.ScriptTarget.ES2022,
    cjs: ts.ScriptTarget.ES2020,
    umd: ts.ScriptTarget.ES2020,
    iife: ts.ScriptTarget.ES2020,
  };

  const moduleMap: Record<string, number> = {
    esm: ts.ModuleKind.ESNext,
    cjs: ts.ModuleKind.CommonJS,
  };

  const jsxMap: Record<string, number> = {
    react: ts.JsxEmit.React,
    preserve: ts.JsxEmit.Preserve,
    "react-jsx": ts.JsxEmit.ReactJSX,
  };

  const compilerOptions: Record<string, unknown> = {
    target: targetMap[options.target ?? "esm"] ?? ts.ScriptTarget.ES2022,
    module: moduleMap[options.module ?? "esm"] ?? ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    esModuleInterop: true,
    allowJs: true,
    checkJs: false,
    isolatedModules: true,
    sourceMap: !!options.sourceMap,
    strict: false,
  };

  if (emitJSX) {
    compilerOptions["jsx"] = jsxMap[options.jsx ?? "react"] ?? ts.JsxEmit.React;
  }

  const result = ts.transpileModule(source, {
    compilerOptions: compilerOptions as object as import("typescript").CompilerOptions,
    fileName: options.fileName,
    reportDiagnostics: true,
  });

  const diagnostics = (result.diagnostics ?? []).map((d) => ({
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    category:
      d.category === ts.DiagnosticCategory.Error
        ? ("error" as const)
        : d.category === ts.DiagnosticCategory.Warning
          ? ("warning" as const)
          : ("info" as const),
  }));

  return {
    code: result.outputText,
    map: result.sourceMapText,
    diagnostics,
    loader,
  };
}

/**
 * Compile a file on disk, writing the output to a mirror path.
 *
 * Returns { inputPath, outputPath, code, map, diagnostics }.
 */
export interface FileCompileResult extends CompileResult {
  inputPath: string;
  outputPath: string;
  bytesIn: number;
  bytesOut: number;
}

export async function compileFile(
  inputPath: string,
  outputPath: string,
  options: Omit<CompileOptions, "fileName"> = {}
): Promise<FileCompileResult> {
  const { readFile, writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");

  const source = await readFile(inputPath, "utf-8");
  const compiled = await compileSource(source, {
    ...options,
    fileName: inputPath,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, compiled.code, "utf-8");

  if (options.sourceMap && compiled.map) {
    await writeFile(`${outputPath}.map`, compiled.map, "utf-8");
  }

  return {
    ...compiled,
    inputPath,
    outputPath,
    bytesIn: Buffer.byteLength(source, "utf-8"),
    bytesOut: Buffer.byteLength(compiled.code, "utf-8"),
  };
}

/**
 * Mirror-compile every *.jsx/*.tsx/*.ts/*.js file under `entryDir` into
 * `outDir`, preserving the relative directory layout.
 *
 * Returns an array of per-file results. Files with errors are included
 * but their `outputPath` contains whatever TypeScript emitted (often a
 * best-effort partial output).
 */
export async function compileProject(
  entryDir: string,
  outDir: string,
  options: Omit<CompileOptions, "fileName"> = {}
): Promise<FileCompileResult[]> {
  const { readdir, stat } = await import("node:fs/promises");
  const { join, relative, extname } = await import("node:path");

  const results: FileCompileResult[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (ext !== ".jsx" && ext !== ".tsx" && ext !== ".ts" && ext !== ".js") continue;

      const rel = relative(entryDir, full);
      const outRel = rel.replace(/\.(jsx|tsx|ts)$/i, ".js");
      const outPath = join(outDir, outRel);
      const result = await compileFile(full, outPath, options);
      results.push(result);
    }
  }

  const st = await stat(entryDir);
  if (st.isFile()) {
    const { basename } = await import("node:path");
    const outPath = join(outDir, basename(entryDir).replace(/\.(jsx|tsx|ts)$/i, ".js"));
    results.push(await compileFile(entryDir, outPath, options));
  } else {
    await walk(entryDir);
  }

  return results;
}
