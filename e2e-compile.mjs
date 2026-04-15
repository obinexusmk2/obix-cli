// End-to-end smoke test for the new compile pipeline.
// Uses the freshly-built dist/ to validate compiler, registry, and CLI compile().
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCLI, compileSource, scanComponents, buildRegistry, detectLoader,
} from './dist/index.js';

let pass = 0, fail = 0;
const t = (name, fn) => Promise.resolve().then(fn).then(
  () => { pass++; console.log('  PASS ', name); },
  (e) => { fail++; console.log('  FAIL ', name, '::', e.message); }
);
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const contains = (s, needle, msg) => { if (!String(s).includes(needle)) throw new Error(`${msg}: ${needle} not in ${String(s).slice(0,200)}`); };

console.log('=== unit: detectLoader ===');
await t('jsx detection',        () => eq(detectLoader('App.jsx'), 'jsx', 'jsx'));
await t('tsx detection',        () => eq(detectLoader('App.tsx'), 'tsx', 'tsx'));
await t('ts detection',         () => eq(detectLoader('util.ts'), 'ts',  'ts'));
await t('js default',           () => eq(detectLoader('x.mjs'),   'js',  'js'));
await t('case-insensitive jsx', () => eq(detectLoader('X.JSX'),   'jsx', 'case'));

console.log('=== unit: compileSource (JSX → React.createElement) ===');
await t('compiles functional JSX', async () => {
  const r = await compileSource(
    `import React from 'react'; export function Hi({n}){return <div>Hi {n}</div>;}`,
    { fileName: 'Hi.jsx', module: 'esm', jsx: 'react' }
  );
  contains(r.code, 'React.createElement', 'createElement emit');
  ok(r.loader === 'jsx', 'loader jsx');
  ok(r.diagnostics.filter(d=>d.category==='error').length===0, 'no errors');
});
await t('TSX strips types', async () => {
  const r = await compileSource(
    `interface P {n:string} export const C:any=(p:P)=><span>{p.n}</span>;`,
    { fileName: 'C.tsx' }
  );
  ok(!/interface\s+P/.test(r.code), 'interface stripped');
  contains(r.code, 'React.createElement', 'createElement');
});
await t('CJS module mode', async () => {
  const r = await compileSource(
    `import React from 'react'; export default function A(){return <i/>;}`,
    { fileName:'A.jsx', module: 'cjs' }
  );
  ok(/require\(|exports\./.test(r.code), 'cjs emit');
});
await t('source maps', async () => {
  const r = await compileSource(`export const x=1;`, {fileName:'x.ts', sourceMap:true});
  ok(r.map && r.map.includes('"version"'), 'map JSON');
});

console.log('=== unit: registry.scanComponents ===');
await t('named functional',  () => eq(scanComponents('export function Foo(){}','f.jsx')[0].name,'Foo','Foo'));
await t('default functional',() => ok(scanComponents('export default function App(){}','a.jsx')[0].isDefault, 'default'));
await t('arrow component',   () => eq(scanComponents('export const Card = (p) => null;','c.jsx')[0].paradigm,'functional','arrow'));
await t('class component',   () => eq(scanComponents('export class Todo extends React.Component { render(){} }','t.jsx')[0].paradigm,'class','class'));
await t('ignore lowercase',  () => eq(scanComponents('export function helper(){}\nexport const useHook = () => null;','u.js').length,0,'no lowercase'));

console.log('=== integration: compile react-todoapp fixture ===');
const ws = mkdtempSync(join(tmpdir(), 'obix-e2e-'));
const src = join(ws, 'src');
const out = join(ws, 'dist');
mkdirSync(join(src, 'components', 'functional'), { recursive: true });
mkdirSync(join(src, 'components', 'class'),      { recursive: true });
writeFileSync(join(src, 'main.jsx'), `import React from 'react'; import App from './App.jsx'; console.log(App);`);
writeFileSync(join(src, 'App.jsx'), `import React from 'react';
import { TodoAppFunctional } from './components/functional/TodoApp.functional.jsx';
import { TodoAppClass } from './components/class/TodoApp.class.jsx';
export default function App(){ return <div><TodoAppFunctional/><TodoAppClass/></div>; }`);
writeFileSync(join(src, 'components/functional/TodoApp.functional.jsx'),
  `import React, {useState} from 'react'; export function TodoAppFunctional(){ const [i]=useState([]); return <ul>{i.length}</ul>; }`);
writeFileSync(join(src, 'components/class/TodoApp.class.jsx'),
  `import React from 'react'; export class TodoAppClass extends React.Component { render(){return <ul/>;} }`);
writeFileSync(join(src, 'components/class/ErrorBoundary.class.jsx'),
  `import React from 'react'; export default class ErrorBoundary extends React.Component { render(){return this.props.children;} }`);
writeFileSync(join(src, 'todo-types.ts'),
  `export interface TodoItem {id:string; text:string} export function newTodo(t:string):TodoItem{return {id:'x',text:t};}`);

const cli = createCLI({ packageRoot: ws, strictMode: false });
const result = await cli.compile({
  entry: 'src', outDir: 'dist', module: 'esm', jsx: 'react', sourceMap: true, buildRegistry: true,
});

await t('compile success',      () => ok(result.success, 'compile success: '+JSON.stringify(result.errors)));
await t('file count',           () => eq(result.filesProcessed, 6, 'files processed'));
await t('no failed files',      () => eq(result.filesFailed, 0, 'no failures'));
await t('functional emit',      () => {
  const js = readFileSync(join(out,'components','functional','TodoApp.functional.js'),'utf8');
  contains(js, 'React.createElement', 'createElement');
  contains(js, 'TodoAppFunctional', 'identifier');
});
await t('class emit',           () => {
  const js = readFileSync(join(out,'components','class','TodoApp.class.js'),'utf8');
  contains(js, 'class TodoAppClass extends React.Component', 'class def');
});
await t('types stripped in TS', () => {
  const js = readFileSync(join(out,'todo-types.js'),'utf8');
  ok(!/interface\s+TodoItem/.test(js), 'interface removed');
  contains(js, 'export function newTodo', 'fn preserved');
});
await t('sourcemap emitted',    () => ok(existsSync(join(out,'App.js.map')), 'map present'));
await t('registry populated',   () => {
  ok(result.registry, 'registry defined');
  const names = result.registry.map(r=>r.name);
  ['App','TodoAppFunctional','TodoAppClass','ErrorBoundary'].forEach(n =>
    ok(names.includes(n), 'missing '+n));
  const fn  = result.registry.find(r=>r.name==='TodoAppFunctional');
  const cls = result.registry.find(r=>r.name==='TodoAppClass');
  const eb  = result.registry.find(r=>r.name==='ErrorBoundary');
  eq(fn.paradigm,'functional','fn paradigm');
  eq(cls.paradigm,'class','cls paradigm');
  ok(eb.isDefault, 'EB default');
});

console.log('=== integration: missing entry (TN) ===');
const badCli = createCLI({ packageRoot: ws });
const badResult = await badCli.compile({ entry: 'nonexistent-dir', outDir: 'dist2' });
await t('missing entry fails gracefully', () => {
  ok(!badResult.success, 'should fail');
  ok(badResult.errors && badResult.errors.length > 0, 'errors reported');
});

console.log('=== integration: single-file entry ===');
writeFileSync(join(src, 'Solo.jsx'), `export function Solo(){ return <span/>; }`);
const singleResult = await createCLI({ packageRoot: ws }).compile({
  entry: 'src/Solo.jsx', outDir: 'dist-single',
});
await t('single file compile',  () => {
  ok(singleResult.success, 'ok');
  eq(singleResult.filesProcessed, 1, 'one file');
  contains(readFileSync(join(ws, 'dist-single', 'Solo.js'),'utf8'), 'React.createElement', 'createElement');
});

rmSync(ws, { recursive: true, force: true });

console.log(`\n=== TOTAL: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
