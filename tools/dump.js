
const fs=require('fs');const S=process.argv[2];
globalThis.window=undefined;
eval(fs.readFileSync(S+'/vedic.js','utf8'));
Vedic.loadLexicon(fs.readFileSync(S+'/lexicon.txt','utf8'));
eval(fs.readFileSync(S+'/translate.js','utf8'));
const P=(globalThis.Translate.phrases||[]);
const extra=JSON.parse(process.argv[3]||'[]');
const out=P.concat(extra).map(p=>({en:p.en,deva:p.deva,tag:p.tag,a:Vedic.analyze(p.deva)}));
console.log(JSON.stringify(out));
