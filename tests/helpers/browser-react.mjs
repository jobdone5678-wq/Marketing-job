import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

export async function browserReactModules() {
  const require = createRequire(import.meta.url);
  const packages = { react: ['react', 'react.production.js'], 'react/jsx-runtime': ['react', 'react-jsx-runtime.production.js'], 'react-dom': ['react-dom', 'react-dom.production.js'], scheduler: ['scheduler', 'scheduler.production.js'], 'react-dom/client': ['react-dom', 'react-dom-client.production.js'] };
  return Object.fromEntries(await Promise.all(Object.entries(packages).map(async ([name, [pkg, file]]) => [name, await readFile(path.join(path.dirname(require.resolve(pkg + '/package.json')), 'cjs', file), 'utf8')])));
}

export function browserModuleScript(sources, entry) {
  return `(() => { const sources=${JSON.stringify(sources)}, cache={}; function require(name){if(cache[name])return cache[name].exports;if(!(name in sources))throw new Error('Missing browser module: '+name);const module={exports:{}};cache[name]=module;new Function('require','module','exports',sources[name])(require,module,module.exports);return module.exports;} ${entry} })();`;
}
