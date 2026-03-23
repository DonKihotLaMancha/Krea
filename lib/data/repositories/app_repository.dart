import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../models/study_models.dart';
import '../../services/academics/exam_simulation_service.dart';
import '../../services/academics/gradebook_service.dart';
import '../../services/ai/ai_provider.dart';
import '../../services/ai/presentation_generation_service.dart';
import '../../services/chat/chat_service.dart';
import '../../services/fitness/diet_recommendation_service.dart';
import '../../services/fitness/medical_evidence_service.dart';
import '../../services/fitness/progress_prediction_service.dart';

final appRepositoryProvider = Provider((ref) {
  final ai = MockAiProvider();
  return AppRepository(
    ai,
    ChatService(LocalChatAdapter()),
    DietRecommendationService(),
    ProgressPredictionService(MedicalEvidenceService()),
    PresentationGenerationService(ai),
    GradebookService(),
    ExamSimulationService(),
  );
});

class AppRepository {
  AppRepository(
    this.aiProvider,
    this.chatService,
    this.dietRecommendationService,
    this.progressPredictionService,
    this.presentationService,
    this.gradebookService,
    this.examSimulationService,
  );

  final AiProvider aiProvider;
  final ChatService chatService;
  final DietRecommendationService dietRecommendationService;
  final ProgressPredictionService progressPredictionService;
  final PresentationGenerationService presentationService;
  final GradebookService gradebookService;
  final ExamSimulationService examSimulationService;
  final _uuid = const Uuid();

  final List<StudyChunk> _chunks = [];
  final List<Flashcard> _flashcards = [];
  final List<ChallengeResult> _challengeResults = [];
  final List<NutritionEntry> _nutritionEntries = [];
  final List<TaskItem> _tasks = [];
  final List<QuizResult> _quizResults = [];
  final List<ChatMessage> _chatMessages = [];
  FitnessProfile? _fitnessProfile;
  final List<WorkoutEntry> _workoutEntries = [];
  DietRecommendation? _dietRecommendation;
  ProgressPrediction? _progressPrediction;
  final List<PresentationDraft> _presentations = [];
  final List<GradeEntry> _grades = [];
  final List<AcademicSimulation> _simulations = [];

  List<StudyChunk> get chunks => List.unmodifiable(_chunks);
  List<Flashcard> get flashcards => List.unmodifiable(_flashcards);
  List<ChallengeResult> get challengeResults => List.unmodifiable(_challengeResults);
  List<NutritionEntry> get nutritionEntries => List.unmodifiable(_nutritionEntries);
  List<TaskItem> get tasks => List.unmodifiable(_tasks);
  List<QuizResult> get quizResults => List.unmodifiable(_quizResults);
  List<ChatMessage> get chatMessages => List.unmodifiable(_chatMessages);
  FitnessProfile? get fitnessProfile => _fitnessProfile;
  List<WorkoutEntry> get workoutEntries => List.unmodifiable(_workoutEntries);
  DietRecommendation? get dietRecommendation => _dietRecommendation;
  ProgressPrediction? get progressPrediction => _progressPrediction;
  List<PresentationDraft> get presentations => List.unmodifiable(_presentations);
  List<GradeEntry> get grades => List.unmodifiable(_grades);
  List<AcademicSimulation> get simulations => List.unmodifiable(_simulations);

  void addChunk(StudyChunk chunk) {
    _chunks.insert(0, chunk);
  }

  void generateFlashcardsFromChunk(StudyChunk chunk) {
    final parts = chunk.content
        .split(RegExp(r'[.!?\n]+'))
        .map((s) => s.trim())
        .where((s) => s.length > 12)
        .take(12)
        .toList();
    final source = parts.isEmpty ? [chunk.content.trim()] : parts;
    for (final sentence in source) {
      final text = sentence.trim();
      if (text.isEmpty) continue;
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

  void addTask(String title, DateTime dueDate, String priority) {
    _tasks.insert(0, TaskItem(id: _uuid.v4(), title: title, dueDate: dueDate, priority: priority));
  }

  void toggleTask(String id) {
    final idx = _tasks.indexWhere((t) => t.id == id);
    if (idx >= 0) _tasks[idx] = _tasks[idx].copyWith(done: !_tasks[idx].done);
  }

  void addQuizResult(String topic, int total, int correct, Duration elapsed) {
    _quizResults.insert(
      0,
      QuizResult(id: _uuid.v4(), topic: topic, total: total, correct: correct, elapsed: elapsed),
    );
  }

  Future<void> sendChat(String roomId, String sender, String message, {bool isPrivate = false}) async {
    await chatService.postMessage(
      roomId: roomId,
      sender: sender,
      content: message,
      isPrivate: isPrivate,
    );
    final msgs = await chatService.getMessages(roomId);
    _chatMessages
      ..removeWhere((m) => m.roomId == roomId)
      ..addAll(msgs);
  }

  List<ChatMessage> roomMessages(String roomId) => _chatMessages.where((m) => m.roomId == roomId).toList();

  void setFitnessProfile(FitnessProfile profile) {
    _fitnessProfile = profile;
    _dietRecommendation = dietRecommendationService.buildPlan(profile);
  }

  void addWorkout(String exercise, int minutes) {
    _workoutEntries.insert(0, WorkoutEntry(date: DateTime.now(), exercise: exercise, minutes: minutes));
  }

  void computePrediction(int adherencePercent) {
    final profile = _fitnessProfile;
    if (profile == null) return;
    _progressPrediction = progressPredictionService.estimate(
      profile: profile,
      adherencePercent: adherencePercent,
    );
  }

  Future<void> generatePresentation(String topic, String guidelines) async {
    final draft = await presentationService.generate(
      projectTopic: topic,
      teacherGuidelines: guidelines,
    );
    _presentations.insert(0, draft);
  }

  void addGrade(GradeEntry grade) {
    _grades.insert(0, grade);
  }

  double weightedAverage() => gradebookService.computeWeightedAverage(_grades);

  void simulateExam(String examName, double targetAverage, double finalWeight) {
    final sim = examSimulationService.simulate(
      examName: examName,
      currentAverage: weightedAverage(),
      targetAverage: targetAverage,
      finalWeight: finalWeight,
    );
    _simulations.insert(0, sim);
  }
}
