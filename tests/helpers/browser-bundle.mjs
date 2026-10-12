import {build} from 'esbuild';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
let styles;
export async function browserStyles(){
 styles??=readFile('src/app/globals.css','utf8').then(css=>postcss([tailwind({base:process.cwd()})]).process(css,{from:path.resolve('src/app/globals.css')})).then(result=>result.css);
 return styles;
}

// Bundle the actual React components and Base UI dialogs for browser interaction tests.
export async function browserBundle(component, expression, stubs={}) {
 stubs={'next/navigation':`export const useRouter=()=>({push(url){window.location.href=url},replace(url){window.history.replaceState(null,'',url)}});export const usePathname=()=>window.location.pathname;export const useSearchParams=()=>new URLSearchParams(window.location.search);`,...stubs};
 const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import * as Component from '${component}';${expression}`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},alias:{'@':path.resolve('src')},plugins:[{name:'fixtures',setup(build){build.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'js',resolveDir:process.cwd()}));build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`,loader:'js',resolveDir:process.cwd()}));}}]});
 return result.outputFiles[0].text;
}

