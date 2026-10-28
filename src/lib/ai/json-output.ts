// Decode provider output without changing values, inventing missing fields, or
// accepting a partial nested object from a truncated response.
export function parseAIJSON(content:string,finishReason?:string|null):unknown {
 if(finishReason==='length')throw new SyntaxError('AI JSON output was truncated.');
 const source=content.trim().replace(/^\uFEFF/,'').trim();
 if(!source)throw new SyntaxError('AI JSON output was empty.');
 try{return JSON.parse(source);}catch{/* Check a single complete object in a formatting wrapper. */}
 const stack:string[]=[];
 let start=-1,quoted=false,escaped=false,candidate:string|undefined;
 for(let index=0;index<source.length;index++){
  const char=source[index];
  if(!stack.length){
   if(char==='{'||char==='['){start=index;stack.push(char);quoted=false;escaped=false;}
   continue;
  }
  if(quoted){
   if(escaped)escaped=false;
   else if(char==='\\')escaped=true;
   else if(char==='"')quoted=false;
   continue;
  }
  if(char==='"'){quoted=true;continue;}
  if(char==='{'||char==='[')stack.push(char);
  else if(char==='}'||char===']'){
   if(stack.pop()!==(char==='}'?'{':'['))throw new SyntaxError('AI JSON output had mismatched brackets.');
   if(!stack.length){
    if(candidate!==undefined)throw new SyntaxError('AI output contained multiple JSON values.');
    candidate=source.slice(start,index+1);
   }
  }
 }
 if(stack.length||candidate===undefined)throw new SyntaxError('AI output did not contain a complete JSON value.');
 return JSON.parse(candidate);
}
