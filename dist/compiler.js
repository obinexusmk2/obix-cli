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
let _tsCache = null;
async function loadTS() {
    if (_tsCache)
        return _tsCache;
    // Default import for ESM, fall back to namespace import otherwise.
    const mod = await import("typescript");
    _tsCache = (mod.default ?? mod);
    return _tsCache;
}
export function detectLoader(filePath) {
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".tsx"))
        return "tsx";
    if (lower.endsWith(".jsx"))
        return "jsx";
    if (lower.endsWith(".ts"))
        return "ts";
    return "js";
}
/**
 * Compile a single JSX/TSX/TS/JS source string to JavaScript.
 *
 * This is the lowest-level primitive. It is synchronous-at-the-API-level but
 * must load `typescript` once (cached after first call).
 */
export async function compileSource(source, options) {
    const ts = await loadTS();
    const loader = options.loader ?? detectLoader(options.fileName);
    const emitJSX = loader === "jsx" || loader === "tsx";
    const targetMap = {
        esm: ts.ScriptTarget.ES2022,
        es2020: ts.ScriptTarget.ES2020,
        es2021: ts.ScriptTarget.ES2021,
        es2022: ts.ScriptTarget.ES2022,
        cjs: ts.ScriptTarget.ES2020,
        umd: ts.ScriptTarget.ES2020,
        iife: ts.ScriptTarget.ES2020,
    };
    const moduleMap = {
        esm: ts.ModuleKind.ESNext,
        cjs: ts.ModuleKind.CommonJS,
    };
    const jsxMap = {
        react: ts.JsxEmit.React,
        preserve: ts.JsxEmit.Preserve,
        "react-jsx": ts.JsxEmit.ReactJSX,
    };
    const compilerOptions = {
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
        compilerOptions: compilerOptions,
        fileName: options.fileName,
        reportDiagnostics: true,
    });
    const diagnostics = (result.diagnostics ?? []).map((d) => ({
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
        category: d.category === ts.DiagnosticCategory.Error
            ? "error"
            : d.category === ts.DiagnosticCategory.Warning
                ? "warning"
                : "info",
    }));
    return {
        code: result.outputText,
        map: result.sourceMapText,
        diagnostics,
        loader,
    };
}
export async function compileFile(inputPath, outputPath, options = {}) {
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
export async function compileProject(entryDir, outDir, options = {}) {
    const { readdir, stat } = await import("node:fs/promises");
    const { join, relative, extname } = await import("node:path");
    const results = [];
    async function walk(current) {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = join(current, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "node_modules" || entry.name.startsWith("."))
                    continue;
                await walk(full);
                continue;
            }
            if (!entry.isFile())
                continue;
            const ext = extname(entry.name).toLowerCase();
            if (ext !== ".jsx" && ext !== ".tsx" && ext !== ".ts" && ext !== ".js")
                continue;
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
    }
    else {
        await walk(entryDir);
    }
    return results;
}
//# sourceMappingURL=compiler.js.map