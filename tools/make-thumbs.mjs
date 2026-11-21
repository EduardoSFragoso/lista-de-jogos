/* Thumbs das capas — gera assets/covers/thumbs/<id>.webp a partir de
   assets/covers/<id>.<ext>. Cards do site usam o thumb (~20 KB); o modal
   (zoom) continua carregando o original.
   Uso: npm run thumbs  (só reprocessa quem faltando ou com original mais novo). */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const COVERS = 'assets/covers';
const THUMBS = path.join(COVERS, 'thumbs');

const WIDTH = 160;
const QUALITY = 80;
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function main() {
  fs.mkdirSync(THUMBS, { recursive: true });

  const sources = fs
    .readdirSync(COVERS)
    .filter((f) => EXTS.has(path.extname(f).toLowerCase()))
    .sort((a, b) => Number(path.parse(a).name) - Number(path.parse(b).name));

  let made = 0;
  let skipped = 0;
  let origBytes = 0;
  let thumbBytes = 0;

  for (const file of sources) {
    const src = path.join(COVERS, file);
    const id = path.parse(file).name;
    const dst = path.join(THUMBS, `${id}.webp`);
    origBytes += fs.statSync(src).size;

    /* reprocessa só se o thumb não existe ou a capa é mais nova */
    if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) {
      skipped += 1;
      thumbBytes += fs.statSync(dst).size;
      continue;
    }

    await sharp(src).resize({ width: WIDTH }).webp({ quality: QUALITY }).toFile(dst);
    thumbBytes += fs.statSync(dst).size;
    made += 1;
  }

  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(
    `thumbs: ${made} gerados, ${skipped} em dia ` +
      `(originais ${kb(origBytes)}, thumbs ${kb(thumbBytes)}, ` +
      `${Math.max(1, Math.round((thumbBytes / origBytes) * 100))}% do peso)`
  );
}

main();
