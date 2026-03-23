import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart';
import 'package:uuid/uuid.dart';

import '../../data/models/study_models.dart';

class DocumentIngestService {
  final _uuid = const Uuid();

  Future<StudyChunk?> pickAndExtract() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'txt', 'doc', 'docx'],
      withData: true,
    );
    if (result == null) return null;
    final picked = result.files.single;
    final path = picked.path;
    final bytes = picked.bytes;
    final ext = _extensionFromName(picked.name);
    final raw = await _extractRawContent(ext: ext, path: path, bytes: bytes, fileName: picked.name);
    final cleaned = normalizeContent(raw);
    return StudyChunk(
      id: _uuid.v4(),
      title: picked.name,
      content: cleaned,
      sourceType: 'document',
    );
  }

  Future<String> _extractRawContent({
    required String ext,
    required String? path,
    required Uint8List? bytes,
    required String fileName,
  }) async {
    final data = bytes ?? (path != null ? await File(path).readAsBytes() : null);
    if (data == null) return 'Unable to read file data from $fileName.';

    if (ext == 'pdf') {
      final doc = PdfDocument(inputBytes: data);
      final text = PdfTextExtractor(doc).extractText();
      doc.dispose();
      return text.isEmpty ? 'No text detected in PDF: $fileName.' : text;
    }

    try {
      return utf8.decode(data, allowMalformed: true);
    } catch (_) {
      return 'Text extraction is limited for .$ext. Please upload a text-based document.';
    }
  }

  String _extensionFromName(String name) {
    final dot = name.lastIndexOf('.');
    if (dot < 0 || dot == name.length - 1) return '';
    return name.substring(dot + 1).toLowerCase();
  }

  String normalizeContent(String content) {
    final squashed = content.replaceAll(RegExp(r'\s+'), ' ').trim();
    return squashed.length > 5000 ? squashed.substring(0, 5000) : squashed;
  }
}
