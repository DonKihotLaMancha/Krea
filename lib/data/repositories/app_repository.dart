import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../models/study_models.dart';
import '../../services/ai/ai_provider.dart';

final appRepositoryProvider = Provider((ref) => AppRepository(MockAiProvider()));

class AppRepository {
  AppRepository(this.aiProvider);

  final AiProvider aiProvider;
  final _uuid = const Uuid();

  final List<StudyChunk> _chunks = [];
  final List<Flashcard> _flashcards = [];
  final List<ChallengeResult> _challengeResults = [];
  final List<NutritionEntry> _nutritionEntries = [];

  List<StudyChunk> get chunks => List.unmodifiable(_chunks);
  List<Flashcard> get flashcards => List.unmodifiable(_flashcards);
  List<ChallengeResult> get challengeResults => List.unmodifiable(_challengeResults);
  List<NutritionEntry> get nutritionEntries => List.unmodifiable(_nutritionEntries);

  void addChunk(StudyChunk chunk) {
    _chunks.insert(0, chunk);
  }

  void generateFlashcardsFromChunk(StudyChunk chunk) {
    final sentences = chunk.content.split('.').where((s) => s.trim().isNotEmpty).take(8);
    for (final sentence in sentences) {
      final text = sentence.trim();
      final question = 'What does this mean: "${text.length > 30 ? text.substring(0, 30) : text}"?';
      _flashcards.add(Flashcard(id: _uuid.v4(), question: question, answer: text));
    }
  }

  void markFlashcard(String id, bool correct) {
    final card = _flashcards.firstWhere((c) => c.id == id);
    if (correct) {
      card.rightCount += 1;
    } else {
      card.wrongCount += 1;
      _flashcards.remove(card);
      _flashcards.insert(0, card);
    }
  }

  Future<List<ConceptNode>> buildConceptMap(StudyChunk chunk) async {
    final concepts = await aiProvider.extractConcepts(chunk.content);
    return concepts
        .map(
          (c) => ConceptNode(
            id: _uuid.v4(),
            title: c,
            description: 'Key idea from ${chunk.title}: $c',
            imageHint: 'Image idea for $c',
          ),
        )
        .toList();
  }

  void addChallengeResult(ChallengeResult result) => _challengeResults.insert(0, result);
  void addNutritionEntry(NutritionEntry entry) => _nutritionEntries.insert(0, entry);
}
