/**
 * Quick smoke test for server-side ingestion parsers (no Supabase).
 * Run: node scripts/verify-ingestion.mjs
 */
import { parseStudyMaterialBuffer } from '../server/lib/ingestionParsers.js';

async function main() {
  const txt = await parseStudyMaterialBuffer(
    Buffer.from('This is a test document for ingestion. '.repeat(30)),
    'sample.txt',
    'text/plain',
  );
  if (txt.format !== 'text') throw new Error(`expected format text, got ${txt.format}`);
  if (!txt.normalizedText.includes('test document')) throw new Error('normalized text missing');

  const minimalPptx = await import('jszip').then(({ default: JSZip }) => {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    );
    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0"?><a:t xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">Hello from slide</a:t>',
    );
    return zip.generateAsync({ type: 'nodebuffer' });
  });
  const ppt = await parseStudyMaterialBuffer(minimalPptx, 'deck.pptx', '');
  if (ppt.format !== 'pptx') throw new Error(`expected pptx, got ${ppt.format}`);
  if (!ppt.normalizedText.toLowerCase().includes('slide')) throw new Error('pptx text missing');

  console.log('verify-ingestion: ok', { textLen: txt.normalizedText.length, pptxLen: ppt.normalizedText.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
