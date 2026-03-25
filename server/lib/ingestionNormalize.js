/** Mirrors client `cleanAcademicText` in App.jsx for consistent normalization. */
export function cleanAcademicText(raw) {
  let text = String(raw || '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n');

  const cutoffPatterns = [
    /\ball rights reserved\b/i,
    /\bcopyright\b/i,
    /\bterms of use\b/i,
    /\bterms & conditions\b/i,
    /\bterms and conditions\b/i,
    /\bprinted in\b/i,
    /\bunauthorized reproduction\b/i,
    /\blicensed to\b/i,
  ];
  const len = text.length;
  const footerZoneStart = len <= 1600 ? len : Math.max(1200, len - 4000);
  let firstCutoff = -1;
  for (const pattern of cutoffPatterns) {
    const match = text.match(pattern);
    if (match?.index !== undefined && match.index >= footerZoneStart) {
      if (firstCutoff === -1 || match.index < firstCutoff) firstCutoff = match.index;
    }
  }
  if (firstCutoff >= 0) text = text.slice(0, firstCutoff);

  return text.trim();
}

/** Mirrors client `looksLikeGibberish` in App.jsx. */
export function looksLikeGibberish(text) {
  if (!text) return true;
  const sample = text.slice(0, 4000);
  const weird = (sample.match(/[<>{}[\]\\/|~`]/g) || []).length;
  if (weird / Math.max(sample.length, 1) > 0.1) return true;
  const letters = (sample.match(/\p{L}/gu) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  const letterish = Math.max(letters, latin);
  if (letterish >= 60) return false;
  const digits = (sample.match(/\d/g) || []).length;
  if (letterish >= 35 && letterish + digits >= 80) return false;
  return letterish < 40;
}

export function scoreTextQuality(normalizedText, gibberish) {
  if (gibberish) return 0;
  const len = normalizedText.length;
  if (len < 80) return 0.25;
  if (len < 400) return 0.5;
  return Math.min(1, 0.55 + 0.45 * Math.min(1, len / 50000));
}
