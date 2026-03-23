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
  final List<TaskItem> tasks;
  final List<QuizResult> quizResults;
  final List<ChatMessage> chatMessages;
  final FitnessProfile? fitnessProfile;
  final List<WorkoutEntry> workoutEntries;
  final DietRecommendation? dietRecommendation;
  final ProgressPrediction? progressPrediction;
  final List<PresentationDraft> presentations;
  final List<GradeEntry> grades;
  final List<AcademicSimulation> simulations;

  const AppState({
    this.chunks = const [],
    this.flashcards = const [],
    this.challengeResults = const [],
    this.nutritionEntries = const [],
    this.tasks = const [],
    this.quizResults = const [],
    this.chatMessages = const [],
    this.fitnessProfile,
    this.workoutEntries = const [],
    this.dietRecommendation,
    this.progressPrediction,
    this.presentations = const [],
    this.grades = const [],
    this.simulations = const [],
  });

  AppState copyWith({
    List<StudyChunk>? chunks,
    List<Flashcard>? flashcards,
    List<ChallengeResult>? challengeResults,
    List<NutritionEntry>? nutritionEntries,
    List<TaskItem>? tasks,
    List<QuizResult>? quizResults,
    List<ChatMessage>? chatMessages,
    FitnessProfile? fitnessProfile,
    List<WorkoutEntry>? workoutEntries,
    DietRecommendation? dietRecommendation,
    ProgressPrediction? progressPrediction,
    List<PresentationDraft>? presentations,
    List<GradeEntry>? grades,
    List<AcademicSimulation>? simulations,
  }) {
    return AppState(
      chunks: chunks ?? this.chunks,
      flashcards: flashcards ?? this.flashcards,
      challengeResults: challengeResults ?? this.challengeResults,
      nutritionEntries: nutritionEntries ?? this.nutritionEntries,
      tasks: tasks ?? this.tasks,
      quizResults: quizResults ?? this.quizResults,
      chatMessages: chatMessages ?? this.chatMessages,
      fitnessProfile: fitnessProfile ?? this.fitnessProfile,
      workoutEntries: workoutEntries ?? this.workoutEntries,
      dietRecommendation: dietRecommendation ?? this.dietRecommendation,
      progressPrediction: progressPrediction ?? this.progressPrediction,
      presentations: presentations ?? this.presentations,
      grades: grades ?? this.grades,
      simulations: simulations ?? this.simulations,
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

  void addTask(String title, DateTime dueDate, String priority) {
    _repository.addTask(title, dueDate, priority);
    state = state.copyWith(tasks: _repository.tasks);
  }

  void toggleTask(String id) {
    _repository.toggleTask(id);
    state = state.copyWith(tasks: _repository.tasks);
  }

  void addQuizResult(String topic, int total, int correct, Duration elapsed) {
    _repository.addQuizResult(topic, total, correct, elapsed);
    state = state.copyWith(quizResults: _repository.quizResults);
  }

  Future<void> sendChat(String roomId, String sender, String message, {bool isPrivate = false}) async {
    await _repository.sendChat(roomId, sender, message, isPrivate: isPrivate);
    state = state.copyWith(chatMessages: _repository.chatMessages);
  }

  List<ChatMessage> roomMessages(String roomId) => _repository.roomMessages(roomId);

  void setFitnessProfile(FitnessProfile profile) {
    _repository.setFitnessProfile(profile);
    state = state.copyWith(
      fitnessProfile: _repository.fitnessProfile,
      dietRecommendation: _repository.dietRecommendation,
    );
  }

  void addWorkout(String exercise, int minutes) {
    _repository.addWorkout(exercise, minutes);
    state = state.copyWith(workoutEntries: _repository.workoutEntries);
  }

  void computePrediction(int adherencePercent) {
    _repository.computePrediction(adherencePercent);
    state = state.copyWith(progressPrediction: _repository.progressPrediction);
  }

  Future<void> generatePresentation(String topic, String guidelines) async {
    await _repository.generatePresentation(topic, guidelines);
    state = state.copyWith(presentations: _repository.presentations);
  }

  void addGrade(GradeEntry grade) {
    _repository.addGrade(grade);
    state = state.copyWith(grades: _repository.grades);
  }

  double weightedAverage() => _repository.weightedAverage();

  void simulateExam(String examName, double targetAverage, double finalWeight) {
    _repository.simulateExam(examName, targetAverage, finalWeight);
    state = state.copyWith(simulations: _repository.simulations);
  }
}
