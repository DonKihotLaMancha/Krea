import 'package:flutter_test/flutter_test.dart';
import 'package:student_assistant/data/models/study_models.dart';
import 'package:student_assistant/data/repositories/app_repository.dart';
import 'package:student_assistant/services/ai/ai_provider.dart';

void main() {
  test('wrong answer is re-prioritized to front', () {
    final repo = AppRepository(MockAiProvider());
    repo.addChunk(const StudyChunk(id: '1', title: 't', content: 'One. Two. Three.', sourceType: 'document'));
    repo.generateFlashcardsFromChunk(repo.chunks.first);

    final originalFirst = repo.flashcards.first;
    repo.markFlashcard(originalFirst.id, false);

    expect(repo.flashcards.first.id, originalFirst.id);
    expect(repo.flashcards.first.wrongCount, 1);
  });
}
