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

export class ComponentRegistry {
  private entries = new Map<string, RegistryEntry>();

  register(entry: RegistryEntry): void {
    this.entries.set(entry.name, entry);
  }

  get(name: string): RegistryEntry | undefined {
    return this.entries.get(name);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  all(): RegistryEntry[] {
    return Array.from(this.entries.values());
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  filter(paradigm: ComponentParadigm): RegistryEntry[] {
    return this.all().filter((e) => e.paradigm === paradigm);
  }
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
export function scanComponents(source: string, sourcePath: string): RegistryEntry[] {
  const out: RegistryEntry[] = [];

  // export [default] function Foo(
  const fnRegex =
    /export\s+(default\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g;
  for (let m: RegExpExecArray | null; (m = fnRegex.exec(source)); ) {
    out.push({
      name: m[2]!,
      paradigm: "functional",
      sourcePath,
      isDefault: !!m[1],
    });
  }

  // export const Foo = (...) => OR = function(...)
  const constRegex =
    /export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\(|function|React\.memo|React\.forwardRef|memo\(|forwardRef\()/g;
  for (let m: RegExpExecArray | null; (m = constRegex.exec(source)); ) {
    out.push({
      name: m[1]!,
      paradigm: "functional",
      sourcePath,
      isDefault: false,
    });
  }

  // export [default] class Foo extends
  const classRegex =
    /export\s+(default\s+)?class\s+([A-Z][A-Za-z0-9_]*)\s+extends\s+[A-Za-z0-9_.]+/g;
  for (let m: RegExpExecArray | null; (m = classRegex.exec(source)); ) {
    out.push({
      name: m[2]!,
      paradigm: "class",
      sourcePath,
      isDefault: !!m[1],
    });
  }

  return out;
}

/**
 * Build a registry from an array of file sources.
 */
export function buildRegistry(
  files: Array<{ path: string; source: string }>
): ComponentRegistry {
  const reg = new ComponentRegistry();
  for (const f of files) {
    for (const entry of scanComponents(f.source, f.path)) {
      reg.register(entry);
    }
  }
  return reg;
}
