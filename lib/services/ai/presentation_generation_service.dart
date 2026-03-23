import 'package:uuid/uuid.dart';

import '../../data/models/study_models.dart';
import 'ai_provider.dart';

class PresentationGenerationService {
  PresentationGenerationService(this._aiProvider);

  final AiProvider _aiProvider;
  final _uuid = const Uuid();

  Future<PresentationDraft> generate({
    required String projectTopic,
    required String teacherGuidelines,
  }) async {
    final tutorHint = await _aiProvider.tutorReply('Create presentation outline for $projectTopic.');
    final slides = [
      'Title and objective',
      'Problem statement and context',
      'Methodology / project plan',
      'Results or expected outcomes',
      'Conclusion and next steps',
    ];
    final notes = [
      'Follow teacher guidelines: $teacherGuidelines',
      tutorHint,
    ];
    return PresentationDraft(
      id: _uuid.v4(),
      title: projectTopic,
      slides: slides,
      speakerNotes: notes,
    );
  }
}
