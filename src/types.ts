/**
 * OBIX CLI State Types
 * Flat primitive-only state for ObixRuntime component.
 * All fields are depth-1 to satisfy the MaxStateDepth policy (limit: 10).
 */

export type CLICommand =
  | "build"
  | "compile"
  | "validate"
  | "version"
  | "hot-swap"
  | "migrate"
  | "help"
  | "idle";

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
  // Semantic Version X fields
  versionMajor: number;
  versionMinor: number;
  versionPatch: number;
  versionSuffix: string;
  // Hot swap
  hotSwapEnabled: boolean;
  hotSwapDelay: number;
  // Migration
  migrateFrom: string;
  migrateTo: string;
  // Build
  buildTargets: string;
  buildOutputDir: string;
  buildDuration: number;
  // Compile (JSX/TSX)
  compileEntry: string;
  compileOutDir: string;
  compileFilesProcessed: number;
  compileErrors: number;
}
