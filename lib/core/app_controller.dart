import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/study_models.dart';
import '../data/repositories/app_repository.dart';

final appControllerProvider = StateNotifierProvider<AppController, AppState>((ref) {
  return AppController(ref.read(appRepositoryProvider));
});

class AppState {
  final List<StudyChunk> chunks;
  final List<Flashcard> flashcards;
  final List<ChallengeResult> challengeResults;
  final List<NutritionEntry> nutritionEntries;

  const AppState({
    this.chunks = const [],
    this.flashcards = const [],
    this.challengeResults = const [],
    this.nutritionEntries = const [],
  });

  AppState copyWith({
    List<StudyChunk>? chunks,
    List<Flashcard>? flashcards,
    List<ChallengeResult>? challengeResults,
    List<NutritionEntry>? nutritionEntries,
  }) {
    return AppState(
      chunks: chunks ?? this.chunks,
      flashcards: flashcards ?? this.flashcards,
      challengeResults: challengeResults ?? this.challengeResults,
      nutritionEntries: nutritionEntries ?? this.nutritionEntries,
    );
  }
}

class AppController extends StateNotifier<AppState> {
  AppController(this._repository) : super(const AppState());

  final AppRepository _repository;

  void addChunk(StudyChunk chunk) {
    _repository.addChunk(chunk);
    state = state.copyWith(chunks: _repository.chunks);
  }

  void generateFlashcards(StudyChunk chunk) {
    _repository.generateFlashcardsFromChunk(chunk);
    state = state.copyWith(flashcards: _repository.flashcards);
  }

  void markFlashcard(String id, bool correct) {
    _repository.markFlashcard(id, correct);
    state = state.copyWith(flashcards: _repository.flashcards);
  }

  Future<List<ConceptNode>> buildConceptMap(StudyChunk chunk) async {
    return _repository.buildConceptMap(chunk);
  }

  void addChallenge(ChallengeResult result) {
    _repository.addChallengeResult(result);
    state = state.copyWith(challengeResults: _repository.challengeResults);
  }

  void addNutrition(NutritionEntry entry) {
    _repository.addNutritionEntry(entry);
    state = state.copyWith(nutritionEntries: _repository.nutritionEntries);
  }
}
