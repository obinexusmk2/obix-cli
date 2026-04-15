/**
 * OBIX CLI - Build tooling, schema validation, semantic version X management
 */
import { compileSource, compileFile, compileProject, detectLoader, type CompileOptions, type CompileResult, type FileCompileResult, type CompileLoader } from "./compiler.js";
import { ComponentRegistry, buildRegistry, scanComponents, type RegistryEntry, type ComponentParadigm } from "./registry.js";
export type { CLIState, CLICommand, CLIStatus } from "./types.js";
export { compileSource, compileFile, compileProject, detectLoader, ComponentRegistry, buildRegistry, scanComponents, };
export type { CompileOptions, CompileResult, FileCompileResult, CompileLoader, RegistryEntry, ComponentParadigm, };
export type BuildTarget = "esm" | "cjs" | "umd" | "iife";
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
    outputs: Array<{
        target: BuildTarget;
        path: string;
        size: number;
    }>;
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
export declare function createCLI(config: CLIConfig): ObixCLI;
//# sourceMappingURL=index.d.ts.map