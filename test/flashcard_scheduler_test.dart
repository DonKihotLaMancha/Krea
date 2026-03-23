import 'package:flutter_test/flutter_test.dart';
import 'package:student_assistant/data/models/study_models.dart';
import 'package:student_assistant/data/repositories/app_repository.dart';
import 'package:student_assistant/services/academics/exam_simulation_service.dart';
import 'package:student_assistant/services/academics/gradebook_service.dart';
import 'package:student_assistant/services/ai/ai_provider.dart';
import 'package:student_assistant/services/ai/presentation_generation_service.dart';
import 'package:student_assistant/services/chat/chat_service.dart';
import 'package:student_assistant/services/fitness/diet_recommendation_service.dart';
import 'package:student_assistant/services/fitness/medical_evidence_service.dart';
import 'package:student_assistant/services/fitness/progress_prediction_service.dart';

void main() {
  test('wrong answer is re-prioritized to front', () {
    final ai = MockAiProvider();
    final repo = AppRepository(
      ai,
      ChatService(LocalChatAdapter()),
      DietRecommendationService(),
      ProgressPredictionService(MedicalEvidenceService()),
      PresentationGenerationService(ai),
      GradebookService(),
      ExamSimulationService(),
    );
    repo.addChunk(const StudyChunk(id: '1', title: 't', content: 'One. Two. Three.', sourceType: 'document'));
    repo.generateFlashcardsFromChunk(repo.chunks.first);

    final originalFirst = repo.flashcards.first;
    repo.markFlashcard(originalFirst.id, false);

    expect(repo.flashcards.first.id, originalFirst.id);
    expect(repo.flashcards.first.wrongCount, 1);
  });
}
