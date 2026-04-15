/**
 * OBIX Functional Component Registry
 * ----------------------------------
 * A lightweight, paradigm-agnostic registry of React-compatible functional
 * components keyed by canonical name. Used by the CLI compile pipeline to
 * enumerate components found in a React codebase and surface them to the
 * `@obinexusltd/obix-jsx-react` adapter for lifecycle binding.
 *
 * The registry is intentionally flat (depth-1) so it survives StateHaltEngine
 * stability checks in the CLI ObixRuntime component.
 */
export type ComponentParadigm = "functional" | "class" | "unknown";
export interface RegistryEntry {
    /** Canonical component name (from `export function Foo()` / `export class Foo`). */
    name: string;
    /** Paradigm detected from the source. */
    paradigm: ComponentParadigm;
    /** Relative path to the source file that defined it. */
    sourcePath: string;
    /** Whether the component is a default export. */
    isDefault: boolean;
}
export declare class ComponentRegistry {
    private entries;
    register(entry: RegistryEntry): void;
    get(name: string): RegistryEntry | undefined;
    has(name: string): boolean;
    all(): RegistryEntry[];
    size(): number;
    clear(): void;
    filter(paradigm: ComponentParadigm): RegistryEntry[];
}
/**
 * Regex-scan a React source string for component declarations.
 *
 * Detected patterns:
 *   • `export function Foo(...)`        → functional
 *   • `export default function Foo(...)`→ functional (default)
 *   • `export const Foo = (...) => ...` → functional
 *   • `export class Foo extends ...`    → class
 *   • `export default class Foo ...`    → class (default)
 *
 * Lowercase-named functions are ignored (React convention: components start
 * with uppercase). This is intentionally a surface-level scan — the full AST
 * walker lives in `@obinexusltd/obix-jsx-react` and is out of scope for the
 * CLI's compile step.
 */
export declare function scanComponents(source: string, sourcePath: string): RegistryEntry[];
/**
 * Build a registry from an array of file sources.
 */
export declare function buildRegistry(files: Array<{
    path: string;
    source: string;
}>): ComponentRegistry;
//# sourceMappingURL=registry.d.ts.map