class StudyChunk {
  final String id;
  final String title;
  final String content;
  final String sourceType;

  const StudyChunk({
    required this.id,
    required this.title,
    required this.content,
    required this.sourceType,
  });
}

class Flashcard {
  final String id;
  final String question;
  final String answer;
  int wrongCount;
  int rightCount;

  Flashcard({
    required this.id,
    required this.question,
    required this.answer,
    this.wrongCount = 0,
    this.rightCount = 0,
  });
}

class ConceptNode {
  final String id;
  final String title;
  final String description;
  final String imageHint;

  const ConceptNode({
    required this.id,
    required this.title,
    required this.description,
    required this.imageHint,
  });
}

class ChallengeResult {
  final String topic;
  final int questions;
  final Duration elapsed;
  final int correct;

  const ChallengeResult({
    required this.topic,
    required this.questions,
    required this.elapsed,
    required this.correct,
  });
}

class NutritionEntry {
  final DateTime date;
  final int calories;
  final int proteinGrams;

  const NutritionEntry({
    required this.date,
    required this.calories,
    required this.proteinGrams,
  });
}

class TaskItem {
  final String id;
  final String title;
  final DateTime dueDate;
  final String priority;
  final bool done;

  const TaskItem({
    required this.id,
    required this.title,
    required this.dueDate,
    required this.priority,
    this.done = false,
  });

  TaskItem copyWith({bool? done}) {
    return TaskItem(
      id: id,
      title: title,
      dueDate: dueDate,
      priority: priority,
      done: done ?? this.done,
    );
  }
}

class QuizResult {
  final String id;
  final String topic;
  final int total;
  final int correct;
  final Duration elapsed;

  const QuizResult({
    required this.id,
    required this.topic,
    required this.total,
    required this.correct,
    required this.elapsed,
  });
}

class ChatMessage {
  final String id;
  final String roomId;
  final String sender;
  final String content;
  final DateTime createdAt;
  final bool isPrivate;

  const ChatMessage({
    required this.id,
    required this.roomId,
    required this.sender,
    required this.content,
    required this.createdAt,
    this.isPrivate = false,
  });
}

class FitnessProfile {
  final int age;
  final double weightKg;
  final double heightCm;
  final String goal;
  final String preference;

  const FitnessProfile({
    required this.age,
    required this.weightKg,
    required this.heightCm,
    required this.goal,
    required this.preference,
  });
}

class WorkoutEntry {
  final DateTime date;
  final String exercise;
  final int minutes;

  const WorkoutEntry({
    required this.date,
    required this.exercise,
    required this.minutes,
  });
}

class DietRecommendation {
  final int calories;
  final int protein;
  final int carbs;
  final int fats;
  final String note;

  const DietRecommendation({
    required this.calories,
    required this.protein,
    required this.carbs,
    required this.fats,
    required this.note,
  });
}

class MedicalSource {
  final String title;
  final int year;
  final String link;
  final double confidence;

  const MedicalSource({
    required this.title,
    required this.year,
    required this.link,
    required this.confidence,
  });
}

class ProgressPrediction {
  final String summary;
  final double expectedWeightChangeKg;
  final double expectedMuscleGainKg;
  final List<MedicalSource> sources;

  const ProgressPrediction({
    required this.summary,
    required this.expectedWeightChangeKg,
    required this.expectedMuscleGainKg,
    required this.sources,
  });
}

class PresentationDraft {
  final String id;
  final String title;
  final List<String> slides;
  final List<String> speakerNotes;

  const PresentationDraft({
    required this.id,
    required this.title,
    required this.slides,
    required this.speakerNotes,
  });
}

class GradeEntry {
  final String subject;
  final double score;
  final double weight;

  const GradeEntry({
    required this.subject,
    required this.score,
    required this.weight,
  });
}

class AcademicSimulation {
  final String examName;
  final double currentAverage;
  final double targetAverage;
  final double requiredFinalScore;

  const AcademicSimulation({
    required this.examName,
    required this.currentAverage,
    required this.targetAverage,
    required this.requiredFinalScore,
  });
}
