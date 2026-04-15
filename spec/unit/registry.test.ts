/**
 * Unit Tests — Component Registry
 *
 * Validates the regex-based React component scanner used by the compile step.
 */

import { describe, it, expect } from "vitest";
import {
  ComponentRegistry,
  scanComponents,
  buildRegistry,
} from "../../src/registry.js";

describe("unit: scanComponents", () => {
  it("TP: detects named functional component (export function)", () => {
    const src = `export function MyButton(props) { return null; }`;
    const result = scanComponents(src, "MyButton.jsx");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "MyButton",
      paradigm: "functional",
      isDefault: false,
      sourcePath: "MyButton.jsx",
    });
  });

  it("TP: detects default functional component", () => {
    const src = `export default function App() { return null; }`;
    const result = scanComponents(src, "App.jsx");
    expect(result[0]?.isDefault).toBe(true);
    expect(result[0]?.paradigm).toBe("functional");
  });

  it("TP: detects arrow functional component", () => {
    const src = `export const Card = (props) => null;`;
    const result = scanComponents(src, "Card.jsx");
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Card");
    expect(result[0]?.paradigm).toBe("functional");
  });

  it("TP: detects React.memo / React.forwardRef wrappers", () => {
    const src = `
      export const Memo = React.memo(() => null);
      export const Ref = React.forwardRef((p, r) => null);
    `;
    const result = scanComponents(src, "mod.jsx");
    const names = result.map((r) => r.name).sort();
    expect(names).toEqual(["Memo", "Ref"]);
  });

  it("TP: detects class components", () => {
    const src = `export class TodoApp extends React.Component { render() { return null; } }`;
    const result = scanComponents(src, "TodoApp.jsx");
    expect(result[0]).toMatchObject({ name: "TodoApp", paradigm: "class" });
  });

  it("TP: detects default class components", () => {
    const src = `export default class ErrorBoundary extends Component { render() { return null; } }`;
    const result = scanComponents(src, "EB.jsx");
    expect(result[0]).toMatchObject({
      name: "ErrorBoundary",
      paradigm: "class",
      isDefault: true,
    });
  });

  it("TN: ignores lowercase (non-component) exports", () => {
    const src = `
      export function helper() {}
      export const useHook = () => null;
      export const config = {};
    `;
    expect(scanComponents(src, "utils.js")).toHaveLength(0);
  });

  it("TP: detects multiple components in one file", () => {
    const src = `
      export function Header() { return null; }
      export function Footer() { return null; }
      export class Sidebar extends React.Component { render() { return null; } }
    `;
    const result = scanComponents(src, "layout.jsx");
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.paradigm).sort()).toEqual([
      "class",
      "functional",
      "functional",
    ]);
  });
});

describe("unit: ComponentRegistry", () => {
  it("registers and retrieves entries", () => {
    const reg = new ComponentRegistry();
    reg.register({
      name: "Foo",
      paradigm: "functional",
      sourcePath: "Foo.jsx",
      isDefault: false,
    });
    expect(reg.size()).toBe(1);
    expect(reg.has("Foo")).toBe(true);
    expect(reg.get("Foo")?.paradigm).toBe("functional");
  });

  it("dedupes entries with the same name (last wins)", () => {
    const reg = new ComponentRegistry();
    reg.register({
      name: "X",
      paradigm: "functional",
      sourcePath: "a.jsx",
      isDefault: false,
    });
    reg.register({
      name: "X",
      paradigm: "class",
      sourcePath: "b.jsx",
      isDefault: true,
    });
    expect(reg.size()).toBe(1);
    expect(reg.get("X")?.paradigm).toBe("class");
    expect(reg.get("X")?.isDefault).toBe(true);
  });

  it("filter by paradigm works", () => {
    const reg = new ComponentRegistry();
    reg.register({ name: "A", paradigm: "functional", sourcePath: "a.jsx", isDefault: false });
    reg.register({ name: "B", paradigm: "class",      sourcePath: "b.jsx", isDefault: false });
    reg.register({ name: "C", paradigm: "functional", sourcePath: "c.jsx", isDefault: false });
    expect(reg.filter("functional").map((e) => e.name).sort()).toEqual(["A", "C"]);
    expect(reg.filter("class").map((e) => e.name)).toEqual(["B"]);
  });
});

describe("unit: buildRegistry", () => {
  it("TP: builds registry from multi-file source list", () => {
    const reg = buildRegistry([
      { path: "Header.jsx", source: "export function Header() {}" },
      { path: "Footer.jsx", source: "export default function Footer() {}" },
      {
        path: "App.jsx",
        source: "export class App extends React.Component { render() {} }",
      },
    ]);
    expect(reg.size()).toBe(3);
    expect(reg.filter("functional")).toHaveLength(2);
    expect(reg.filter("class")).toHaveLength(1);
  });
});
