import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:uuid/uuid.dart';

import '../../data/models/study_models.dart';

class DocumentIngestService {
  final _uuid = const Uuid();

  Future<StudyChunk?> pickAndExtract() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'txt', 'doc', 'docx'],
    );
    if (result == null || result.files.single.path == null) return null;
    final path = result.files.single.path!;
    final file = File(path);
    final ext = path.split('.').last.toLowerCase();
    final raw = ext == 'pdf'
        ? 'PDF selected: ${result.files.single.name}. Add full PDF parser integration in the next step.'
        : await file.readAsString();
    final cleaned = normalizeContent(raw);
    return StudyChunk(
      id: _uuid.v4(),
      title: result.files.single.name,
      content: cleaned,
      sourceType: 'document',
    );
  }

  String normalizeContent(String content) {
    final squashed = content.replaceAll(RegExp(r'\s+'), ' ').trim();
    return squashed.length > 5000 ? squashed.substring(0, 5000) : squashed;
  }
}
