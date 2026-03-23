import 'package:file_picker/file_picker.dart';
import 'package:uuid/uuid.dart';

import '../../data/models/study_models.dart';

class VideoIngestService {
  final _uuid = const Uuid();

  Future<StudyChunk?> pickAndExtractTranscript() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['mp4', 'mov', 'mkv'],
    );
    if (result == null) return null;
    return StudyChunk(
      id: _uuid.v4(),
      title: result.files.single.name,
      content:
          'Video selected: ${result.files.single.name}. Transcript extraction can be integrated with cloud/local speech-to-text later.',
      sourceType: 'video',
    );
  }
}
