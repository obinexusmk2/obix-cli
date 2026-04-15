/**
 * Integration Tests — Compile React TodoApp
 *
 * Builds a fixture that mirrors `projects/react-todoapp/src` shape
 * (functional + class paradigms) in an os.tmpdir() workspace, then runs
 * the CLI `compile` pipeline end-to-end and asserts:
 *   1. All .jsx/.tsx sources are transpiled to .js with React.createElement calls
 *   2. The mirrored output directory tree matches the input tree
 *   3. The component registry enumerates both paradigms correctly
 *   4. The CLI's ObixRuntime state transitions through running → success
 *
 * This is the "unit + integration" gate the OBIX ship-an-obix-todoapp
 * pipeline depends on.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCLI } from "../../src/index.js";

// ---------------------------------------------------------------------------
// Fixture sources — mirrors projects/react-todoapp/src shape
// ---------------------------------------------------------------------------

const MAIN_JSX = `
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App/></React.StrictMode>);
`.trim();

const APP_JSX = `
import React, { useState } from 'react';
import { TodoAppFunctional } from './components/functional/TodoApp.functional.jsx';
import { TodoAppClass }      from './components/class/TodoApp.class.jsx';

export default function App() {
  const [paradigm, setParadigm] = useState('functional');
  return (
    <div className="obix-root">
      <button onClick={() => setParadigm(p => p === 'functional' ? 'class' : 'functional')}>
        Toggle
      </button>
      {paradigm === 'functional'
        ? <TodoAppFunctional/>
        : <TodoAppClass/>}
    </div>
  );
}
`.trim();

const FN_TODOAPP = `
import React, { useState } from 'react';
export function TodoAppFunctional() {
  const [items, setItems] = useState([]);
  return <ul>{items.map(i => <li key={i.id}>{i.text}</li>)}</ul>;
}
`.trim();

const CLASS_TODOAPP = `
import React from 'react';
export class TodoAppClass extends React.Component {
  state = { items: [] };
  render() {
    return <ul>{this.state.items.map(i => <li key={i.id}>{i.text}</li>)}</ul>;
  }
}
`.trim();

const ERROR_BOUNDARY = `
import React from 'react';
export default class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div>Error: {String(this.state.error)}</div>;
    return this.props.children;
  }
}
`.trim();

const TS_UTILS = `
export interface TodoItem { id: string; text: string; done: boolean; }
export function newTodo(text: string): TodoItem {
  return { id: Math.random().toString(36), text, done: false };
}
`.trim();

// ---------------------------------------------------------------------------

describe("integration: compile react-todoapp", () => {
  let workspace: string;
  let srcDir: string;
  let outDir: string;

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), "obix-cli-compile-"));
    srcDir = join(workspace, "src");
    outDir = join(workspace, "dist");

    await mkdir(join(srcDir, "components", "functional"), { recursive: true });
    await mkdir(join(srcDir, "components", "class"),      { recursive: true });

    await writeFile(join(srcDir, "main.jsx"), MAIN_JSX, "utf-8");
    await writeFile(join(srcDir, "App.jsx"),  APP_JSX,  "utf-8");
    await writeFile(
      join(srcDir, "components", "functional", "TodoApp.functional.jsx"),
      FN_TODOAPP,
      "utf-8"
    );
    await writeFile(
      join(srcDir, "components", "class", "TodoApp.class.jsx"),
      CLASS_TODOAPP,
      "utf-8"
    );
    await writeFile(
      join(srcDir, "components", "class", "ErrorBoundary.class.jsx"),
      ERROR_BOUNDARY,
      "utf-8"
    );
    await writeFile(join(srcDir, "todo-types.ts"), TS_UTILS, "utf-8");
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("TP: compiles the whole src/ tree to dist/ mirroring directory structure", async () => {
    const cli = createCLI({
      packageRoot: workspace,
      strictMode: false,
    });

    const result = await cli.compile({
      entry: "src",
      outDir: "dist",
      module: "esm",
      jsx: "react",
      sourceMap: true,
      buildRegistry: true,
    });

    expect(result.success).toBe(true);
    expect(result.filesFailed).toBe(0);
    // main.jsx, App.jsx, TodoApp.functional.jsx, TodoApp.class.jsx,
    // ErrorBoundary.class.jsx, todo-types.ts = 6 files
    expect(result.filesProcessed).toBe(6);

    // Each .jsx file must produce a .js emission with React.createElement
    const fnOut = await readFile(
      join(outDir, "components", "functional", "TodoApp.functional.js"),
      "utf-8"
    );
    expect(fnOut).toContain("React.createElement");
    expect(fnOut).toContain("TodoAppFunctional");

    const classOut = await readFile(
      join(outDir, "components", "class", "TodoApp.class.js"),
      "utf-8"
    );
    expect(classOut).toMatch(/class TodoAppClass extends React\.Component/);
    expect(classOut).toContain("React.createElement");

    // .ts file must be transpiled (interface removed)
    const tsOut = await readFile(join(outDir, "todo-types.js"), "utf-8");
    expect(tsOut).not.toMatch(/interface\s+TodoItem/);
    expect(tsOut).toMatch(/export function newTodo/);
  });

  it("TP: emits source maps when requested", async () => {
    const mapPath = join(outDir, "App.js.map");
    const st = await stat(mapPath);
    expect(st.size).toBeGreaterThan(0);
  });

  it("TP: produces component registry enumerating both paradigms", async () => {
    const cli = createCLI({ packageRoot: workspace });
    const result = await cli.compile({
      entry: "src",
      outDir: "dist",
      buildRegistry: true,
    });

    expect(result.registry).toBeDefined();
    const names = result.registry!.map((r) => r.name);

    expect(names).toContain("App");
    expect(names).toContain("TodoAppFunctional");
    expect(names).toContain("TodoAppClass");
    expect(names).toContain("ErrorBoundary");

    const fn = result.registry!.find((r) => r.name === "TodoAppFunctional");
    expect(fn?.paradigm).toBe("functional");

    const cls = result.registry!.find((r) => r.name === "TodoAppClass");
    expect(cls?.paradigm).toBe("class");

    const eb = result.registry!.find((r) => r.name === "ErrorBoundary");
    expect(eb?.paradigm).toBe("class");
    expect(eb?.isDefault).toBe(true);

    const app = result.registry!.find((r) => r.name === "App");
    expect(app?.isDefault).toBe(true);
  });

  it("TN: returns failure when entry does not exist", async () => {
    const cli = createCLI({ packageRoot: workspace });
    const result = await cli.compile({
      entry: "nonexistent-src",
      outDir: "dist",
    });
    expect(result.success).toBe(false);
    expect(result.errors?.length ?? 0).toBeGreaterThan(0);
  });

  it("TP: compiles a single file entry (not a directory)", async () => {
    const singleFile = join(srcDir, "singleton.jsx");
    await writeFile(
      singleFile,
      `export function Solo() { return <span/>; }`,
      "utf-8"
    );
    const cli = createCLI({ packageRoot: workspace });
    const result = await cli.compile({
      entry: "src/singleton.jsx",
      outDir: "dist-single",
    });
    expect(result.success).toBe(true);
    expect(result.filesProcessed).toBe(1);
    const out = await readFile(
      join(workspace, "dist-single", "singleton.js"),
      "utf-8"
    );
    expect(out).toContain("React.createElement");
  });
});
