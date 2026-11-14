import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('public/particles',{recursive:true});
const sprites=[['petal1.png','#ed8da9'],['leaf1.png','#83ad56'],['petal2.png','#fff1db']];
for(const [name,color] of sprites){const data=Buffer.alloc(16*16*4);for(let y=2;y<14;y++)for(let x=2;x<14;x++){const dx=(x-7.5)/4,dy=(y-7.5)/6;if(dx*dx+dy*dy>1)continue;const i=(y*16+x)*4;const c=Number.parseInt(color.slice(1),16);data[i]=(c>>16)* (x<7?0.85:1);data[i+1]=((c>>8)&255)*(x<7?0.85:1);data[i+2]=(c&255)*(x<7?0.85:1);data[i+3]=255;}await sharp(data,{raw:{width:16,height:16,channels:4}}).png().toFile('public/particles/'+name);}
await writeFile('public/particles/index.json',JSON.stringify(sprites.map(([file])=>file),null,2)+'\n');
