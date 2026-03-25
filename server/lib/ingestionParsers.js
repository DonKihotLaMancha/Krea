import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { cleanAcademicText, looksLikeGibberish, scoreTextQuality } from './ingestionNormalize.js';

/** @param {string} fileName @param {string} [mimeType] */
export function detectIngestFormat(fileName, mimeType = '') {
  const ext = (String(fileName || '').split('.').pop() || '').toLowerCase();
  const m = String(mimeType || '').toLowerCase();
  if (ext === 'pdf' || m.includes('pdf')) return 'pdf';
  if (ext === 'docx' || m.includes('wordprocessingml') || m.includes('officedocument.wordprocessingml')) return 'docx';
  if (ext === 'pptx' || m.includes('presentationml') || m.includes('officedocument.presentationml')) return 'pptx';
  if (['txt', 'md', 'csv', 'json', 'log'].includes(ext) || m.startsWith('text/')) return 'text';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'].includes(ext) || m.startsWith('image/')) return 'image';
  if (ext === 'doc' || ext === 'ppt') return 'legacy_office';
  return 'unknown';
}

function extractPptxTextFromXml(xml) {
  const parts = [];
  const re = /<a:t[^>]*>([^<]*)<\/a:t>|<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(xml))) {
    const chunk = (m[1] || m[2] || '').trim();
    if (chunk) parts.push(chunk);
  }
  return parts.join('\n');
}

async function parsePptxBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((k) => /ppt\/slides\/slide\d+\.xml$/i.test(k));
  names.sort((a, b) => {
    const na = Number((a.match(/slide(\d+)/i) || [])[1] || 0);
    const nb = Number((b.match(/slide(\d+)/i) || [])[1] || 0);
    return na - nb;
  });
  const slideTexts = [];
  for (const name of names) {
    const xml = await zip.file(name).async('string');
    const t = extractPptxTextFromXml(xml);
    if (t.trim()) slideTexts.push(t);
  }
  return slideTexts.join('\n\n');
}

async function parsePdfBuffer(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    const raw = String(textResult?.text || '');
    const numpages = Number(textResult?.total || 0) || 0;
    return { raw, numpages };
  } finally {
    await parser.destroy();
  }
}

async function parseImageOcr(buffer) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return String(text || '');
  } finally {
    await worker.terminate();
  }
}

/**
 * Parse arbitrary study material bytes into normalized text.
 * @param {Buffer} buffer
 * @param {string} fileName
 * @param {string} [mimeType]
 */
export async function parseStudyMaterialBuffer(buffer, fileName, mimeType = '') {
  const fmt = detectIngestFormat(fileName, mimeType);
  const warnings = [];
  const started = Date.now();
  let raw = '';
  let pageCount = null;

  if (fmt === 'unknown' || fmt === 'legacy_office') {
    const err = new Error(
      fmt === 'legacy_office'
        ? 'Legacy .doc/.ppt is not supported. Save as .docx or .pptx and upload again.'
        : 'Unsupported file type. Use PDF, DOCX, PPTX, TXT/MD/CSV, or common image formats.',
    );
    err.code = 'UNSUPPORTED_FORMAT';
    throw err;
  }

  if (fmt === 'pdf') {
    const r = await parsePdfBuffer(buffer);
    raw = r.raw;
    pageCount = r.numpages || null;
    if (!raw.trim()) {
      warnings.push('PDF text layer is empty or unreadable (scanned PDF). Try OCR or a text-based export.');
    }
  } else if (fmt === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    raw = String(result.value || '');
    if (result.messages?.length) {
      for (const msg of result.messages.slice(0, 5)) {
        if (msg?.message) warnings.push(String(msg.message).slice(0, 200));
      }
    }
  } else if (fmt === 'pptx') {
    try {
      raw = await parsePptxBuffer(buffer);
    } catch (e) {
      const err = new Error(`Could not read PPTX: ${e?.message || e}`);
      err.code = 'PARSE_FAILED';
      throw err;
    }
  } else if (fmt === 'text') {
    try {
      const dec = new TextDecoder('utf-8', { fatal: false });
      raw = dec.decode(new Uint8Array(buffer));
    } catch {
      raw = buffer.toString('latin1');
    }
  } else if (fmt === 'image') {
    warnings.push('Running OCR on images can take a minute for large files.');
    try {
      raw = await parseImageOcr(buffer);
    } catch (e) {
      const err = new Error(`OCR failed: ${e?.message || e}`);
      err.code = 'PARSE_FAILED';
      throw err;
    }
  }

  const normalizedText = cleanAcademicText(raw);
  const gibberish = looksLikeGibberish(normalizedText);
  const qualityScore = scoreTextQuality(normalizedText, gibberish) * (normalizedText.length < 40 ? 0.5 : 1);

  if (!normalizedText.trim()) {
    const err = new Error('No readable text could be extracted from this file.');
    err.code = 'EMPTY_TEXT';
    throw err;
  }

  if (gibberish) {
    warnings.push('Extracted text looks low quality (scanned PDF, encoding, or layout).');
  }

  const extractionMeta = {
    ingestFormat: fmt,
    format: fmt,
    mimeType: mimeType || null,
    parseMs: Date.now() - started,
    pageCount,
    warnings,
    qualityScore,
    gibberishLikely: gibberish,
  };

  return {
    rawText: raw,
    normalizedText,
    format: fmt,
    mimeType: mimeType || null,
    warnings,
    qualityScore,
    extractionMeta,
    pageCount,
  };
}
