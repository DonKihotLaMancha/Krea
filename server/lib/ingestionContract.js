/**
 * Unified ingestion contract (server-side).
 * @typedef {'pdf'|'docx'|'pptx'|'text'|'image'|'unknown'} IngestFormat
 */

/**
 * @typedef {Object} ParsedStudyMaterial
 * @property {string} rawText
 * @property {string} normalizedText
 * @property {IngestFormat} format
 * @property {string} [mimeType]
 * @property {string[]} warnings
 * @property {number} qualityScore 0..1
 * @property {Record<string, unknown>} extractionMeta
 */

/**
 * @typedef {Object} IngestApiSuccess
 * @property {true} ok
 * @property {string} id
 * @property {boolean} [deduplicated]
 * @property {boolean} [storageUploaded]
 * @property {string} [storageWarning]
 * @property {boolean} [embeddingDeferred]
 * @property {string} [embeddingWarning]
 * @property {string} [normalizedText]
 * @property {string[]} [warnings]
 * @property {number} [qualityScore]
 * @property {string} [ingestFormat]
 * @property {string} [errorType]
 */

/**
 * @typedef {Object} IngestApiError
 * @property {false} ok
 * @property {string} error
 * @property {string} [errorType] parse_error|storage_error|db_error|validation_error|unsupported
 * @property {{ message?: string, code?: string }} [details]
 */

export {};
