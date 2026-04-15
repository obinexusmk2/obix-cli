/**
 * Unit Tests — JSX/TSX Compiler
 *
 * Validates that the compiler transpiles React JSX and TSX source to
 * browser-compatible JavaScript with correct emit settings.
 *
 * HITL classification (reused from fixtures/index.ts):
 *   TP: compiler correctly emits JS for valid JSX/TSX
 *   TN: compiler correctly reports diagnostics on malformed input
 *   FP: compiler silently accepts broken input (guarded against)
 *   FN: compiler rejects valid input (guarded against)
 */

import { describe, it, expect } from "vitest";
import {
  compileSource,
  detectLoader,
  type CompileLoader,
} from "../../src/compiler.js";

describe("unit: detectLoader", () => {
  it("detects .jsx as jsx", () => {
    expect(detectLoader("src/App.jsx")).toBe<CompileLoader>("jsx");
  });

  it("detects .tsx as tsx", () => {
    expect(detectLoader("src/App.tsx")).toBe<CompileLoader>("tsx");
  });

  it("detects .ts as ts", () => {
    expect(detectLoader("src/utils.ts")).toBe<CompileLoader>("ts");
  });

  it("defaults to js for .js and unknown extensions", () => {
    expect(detectLoader("src/main.js")).toBe<CompileLoader>("js");
    expect(detectLoader("src/main.mjs")).toBe<CompileLoader>("js");
  });

  it("is case-insensitive", () => {
    expect(detectLoader("src/App.JSX")).toBe<CompileLoader>("jsx");
    expect(detectLoader("src/App.TSX")).toBe<CompileLoader>("tsx");
  });
});

describe("unit: compileSource (JSX)", () => {
  it("TP: compiles a functional React component to React.createElement", async () => {
    const source = `
      import React from 'react';
      export function Hello({ name }) {
        return <div className="g">Hello, {name}</div>;
      }
    `;
    const result = await compileSource(source, {
      fileName: "Hello.jsx",
      module: "esm",
      jsx: "react",
    });
    expect(result.loader).toBe("jsx");
    expect(result.code).toContain("React.createElement");
    expect(result.code).toContain("\"div\"");
    expect(result.diagnostics.filter((d) => d.category === "error")).toHaveLength(0);
  });

  it("TP: preserves ESM import/export in ESM mode", async () => {
    const source = `
      import React from 'react';
      export default function App() { return <span/>; }
    `;
    const result = await compileSource(source, {
      fileName: "App.jsx",
      module: "esm",
    });
    expect(result.code).toMatch(/^import React/m);
    expect(result.code).toMatch(/export default/);
  });

  it("TP: emits CommonJS when module=cjs", async () => {
    const source = `
      import React from 'react';
      export default function App() { return <div/>; }
    `;
    const result = await compileSource(source, {
      fileName: "App.jsx",
      module: "cjs",
    });
    expect(result.code).toMatch(/require\(/);
    expect(result.code).toMatch(/exports\.default|module\.exports/);
  });
});

describe("unit: compileSource (TSX)", () => {
  it("TP: strips TypeScript types and emits JSX", async () => {
    const source = `
      import React from 'react';
      interface Props { name: string; count: number }
      export const Greeting: React.FC<Props> = ({ name, count }) => (
        <div data-n={count}>Hi {name}</div>
      );
    `;
    const result = await compileSource(source, {
      fileName: "Greeting.tsx",
      module: "esm",
      jsx: "react",
    });
    expect(result.loader).toBe("tsx");
    expect(result.code).not.toMatch(/interface\s+Props/);
    expect(result.code).not.toMatch(/:\s*React\.FC/);
    expect(result.code).toContain("React.createElement");
  });

  it("TP: supports react-jsx (automatic runtime)", async () => {
    const source = `
      export function Card() { return <div/>; }
    `;
    const result = await compileSource(source, {
      fileName: "Card.tsx",
      module: "esm",
      jsx: "react-jsx",
    });
    // automatic runtime injects react/jsx-runtime import
    expect(result.code).toMatch(/react\/jsx-runtime/);
  });
});

describe("unit: compileSource (plain TS/JS passthrough)", () => {
  it("TP: compiles plain TypeScript", async () => {
    const source = `export function add(a: number, b: number): number { return a + b; }`;
    const result = await compileSource(source, {
      fileName: "math.ts",
      module: "esm",
    });
    expect(result.loader).toBe("ts");
    expect(result.code).toMatch(/function add\(a, b\)/);
  });

  it("TP: leaves plain JavaScript intact", async () => {
    const source = `export const PI = 3.14;`;
    const result = await compileSource(source, {
      fileName: "const.js",
      module: "esm",
    });
    expect(result.loader).toBe("js");
    expect(result.code).toMatch(/export const PI = 3\.14/);
  });
});

describe("unit: compileSource source maps", () => {
  it("TP: emits source map text when sourceMap=true", async () => {
    const result = await compileSource(
      `export const x = 1;`,
      { fileName: "x.ts", sourceMap: true }
    );
    expect(result.map).toBeTruthy();
    expect(result.map).toMatch(/"version"\s*:\s*3/);
  });

  it("TP: omits source map text when sourceMap=false", async () => {
    const result = await compileSource(
      `export const x = 1;`,
      { fileName: "x.ts", sourceMap: false }
    );
    expect(result.map).toBeFalsy();
  });
});
