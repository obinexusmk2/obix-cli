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
/**
 * Loader classification for an input path.
 */
export type CompileLoader = "jsx" | "tsx" | "ts" | "js";
export declare function detectLoader(filePath: string): CompileLoader;
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
    diagnostics: Array<{
        code: number;
        message: string;
        category: "error" | "warning" | "info";
    }>;
    /** Detected / effective loader. */
    loader: CompileLoader;
}
/**
 * Compile a single JSX/TSX/TS/JS source string to JavaScript.
 *
 * This is the lowest-level primitive. It is synchronous-at-the-API-level but
 * must load `typescript` once (cached after first call).
 */
export declare function compileSource(source: string, options: CompileOptions): Promise<CompileResult>;
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
export declare function compileFile(inputPath: string, outputPath: string, options?: Omit<CompileOptions, "fileName">): Promise<FileCompileResult>;
/**
 * Mirror-compile every *.jsx/*.tsx/*.ts/*.js file under `entryDir` into
 * `outDir`, preserving the relative directory layout.
 *
 * Returns an array of per-file results. Files with errors are included
 * but their `outputPath` contains whatever TypeScript emitted (often a
 * best-effort partial output).
 */
export declare function compileProject(entryDir: string, outDir: string, options?: Omit<CompileOptions, "fileName">): Promise<FileCompileResult[]>;
//# sourceMappingURL=compiler.d.ts.map