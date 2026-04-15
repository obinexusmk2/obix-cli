/**
 * OBIX CLI State Types
 * Flat primitive-only state for ObixRuntime component.
 * All fields are depth-1 to satisfy the MaxStateDepth policy (limit: 10).
 */
export type CLICommand = "build" | "compile" | "validate" | "version" | "hot-swap" | "migrate" | "help" | "idle";
export type CLIStatus = "idle" | "running" | "success" | "error";
/**
 * The state shape for the CLI OBIX component.
 * Intentionally flat — no nested objects — for policy compliance and
 * deep-equality stability detection in StateHaltEngine.
 */
export interface CLIState {
    command: CLICommand;
    status: CLIStatus;
    output: string;
    errorMessage: string;
    packageRoot: string;
    strictMode: boolean;
    versionMajor: number;
    versionMinor: number;
    versionPatch: number;
    versionSuffix: string;
    hotSwapEnabled: boolean;
    hotSwapDelay: number;
    migrateFrom: string;
    migrateTo: string;
    buildTargets: string;
    buildOutputDir: string;
    buildDuration: number;
    compileEntry: string;
    compileOutDir: string;
    compileFilesProcessed: number;
    compileErrors: number;
}
//# sourceMappingURL=types.d.ts.map