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
