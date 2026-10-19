import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// Execute real server modules; substitute only session and database I/O at their boundaries.
export function moduleLoader(overrides = {}) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const nativeRequire = createRequire(import.meta.url);
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const require = name => {
      if (name in overrides) return overrides[name];
      if (name === 'server-only') return {};
      if (name.startsWith('@/') || name.startsWith('.')) {
        let resolved = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(file), name);
        if (!path.extname(resolved)) resolved += '.ts';
        return load(resolved);
      }
      return nativeRequire(name);
    };
    new Function('require', 'module', 'exports', source)(require, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return relative => load(path.join(root, relative));
}

export function fixtureDatabase(tables) {
  return { from(table) {
    let filters = [], orders = [], max = Infinity, start = 0, end = Infinity, single = false;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      is(key, value) { filters.push(row => value===null?row[key]==null:row[key]===value); return query; },
      neq(key, value) { filters.push(row => row[key] !== value); return query; },
      gte(key, value) { filters.push(row => row[key]!=null&&row[key]>=value); return query; },
      lte(key, value) { filters.push(row => row[key]!=null&&row[key]<=value); return query; },
      or(expression) {
        const alternatives=expression.split(',').map(part=>{
          const [key,operator,...rest]=part.split('.');const value=rest.join('.');
          if(operator==='is'&&value==='null')return row=>row[key]==null;
          if(operator==='gt')return row=>row[key]!=null&&Date.parse(row[key])>Date.parse(value);
          throw new Error('Unsupported fixture OR filter: '+part);
        });
        filters.push(row=>alternatives.some(filter=>filter(row)));return query;
      },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      ilike(key, value) { filters.push(row => row[key]?.toLowerCase().includes(value.replace(/^%|%$/g, '').toLowerCase())); return query; },
      order(key, options = {}) { orders.push([key, options.ascending !== false]); return query; },
      limit(value) { max = value; return query; },
      range(a, b) { start = a; end = b; return query; },
      single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        try {
          let rows = (tables[table] || []).filter(row => filters.every(filter => filter(row)));
          const count = rows.length;
          rows = [...rows].sort((a, b) => {
            for (const [key, ascending] of orders) {
              const difference = String(a[key] || '').localeCompare(String(b[key] || ''));
              if (difference) return ascending ? difference : -difference;
            }
            return 0;
          }).slice(start, Math.min(end + 1, start + max));
          return Promise.resolve(resolve({ data: single ? rows[0] || null : rows, count, error: null }));
        } catch (error) { return reject(error); }
      },
    };
    return query;
  } };
}
