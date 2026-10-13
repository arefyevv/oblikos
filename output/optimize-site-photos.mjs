import sharp from '../! oblikos.ru/App/node_modules/sharp/dist/index.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const assets = JSON.parse(await readFile(new URL('./site-photo-sources.json', import.meta.url), 'utf8'));
const directory = new URL('../! oblikos.ru/Site/src/assets/photos/', import.meta.url);
await mkdir(directory, {recursive:true});
for (const {name,path} of assets) {
  const target = new URL(`${name}.webp`,directory);
  const result = await sharp(path).resize({width:1000,withoutEnlargement:true}).webp({quality:86}).toFile(fileURLToPath(target));
  console.log(`${name}: ${Math.round(result.size/1024)} KB`);
}
const tiles = await Promise.all(assets.map(async ({path},index) => ({input:await sharp(path).resize(240,300,{fit:'cover'}).png().toBuffer(),left:(index%5)*240,top:Math.floor(index/5)*300})));
await sharp({create:{width:1200,height:600,channels:3,background:'#f5f6f2'}}).composite(tiles).png().toFile(fileURLToPath(new URL('./site-photo-contact-sheet.png',import.meta.url)));
