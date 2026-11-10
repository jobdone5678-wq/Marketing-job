import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleLoader} from './helpers/load-ts-module.mjs';
const {parseAIJSON}=moduleLoader()('src/lib/ai/json-output.ts');
const value={name:'Alex Example',bullets:['Built APIs with {literal braces} and "quoted" values.','First line\nsecond line'],nested:{values:[1,2]}};
const json=JSON.stringify(value);

for(const [name,raw] of [
 ['plain JSON',json],
 ['leading whitespace and JSON fences','\n\t```json\n'+json+'\n```\n'],
 ['a BOM and formatting prose','\uFEFF Here is the result:\n'+json+'\nEnd of result.'],
 ['uppercase code fence','```JSON\n'+json+'\n```'],
])test(`decodes ${name} without changing source values`,()=>assert.deepEqual(parseAIJSON(raw),value));

for(const raw of ['', 'No JSON result.', '{"name":"Alex",}', '{"outer":{"name":"Alex"}', '{"name":"unterminated}', '{"array":[1,2}', '{}\n{}', '```json\n{"bad":}\n```']){
 test('rejects malformed, incomplete or ambiguous output: '+JSON.stringify(raw),()=>assert.throws(()=>parseAIJSON(raw),SyntaxError));
}
test('a truncation finish reason rejects even syntactically valid partial results',()=>assert.throws(()=>parseAIJSON(json,'length'),/truncated/i));
