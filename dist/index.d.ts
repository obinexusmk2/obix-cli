/**
 * OBIX CLI - Build tooling, schema validation, semantic version X management
 * Command-line interface for OBIX SDK build and validation.
 *
 * The CLI is itself an OBIX component: its runtime state is managed by
 * ObixRuntime. Each command drives a lifecycle transition on that component.
 */
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
export declare function createCLI(config: CLIConfig): ObixCLI;
//# sourceMappingURL=index.d.ts.map