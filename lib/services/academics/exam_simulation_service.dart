import '../../data/models/study_models.dart';

class ExamSimulationService {
  AcademicSimulation simulate({
    required String examName,
    required double currentAverage,
    required double targetAverage,
    required double finalWeight,
  }) {
    final remainingWeight = 1 - finalWeight;
    final required = finalWeight <= 0
        ? 0
        : ((targetAverage - (currentAverage * remainingWeight)) / finalWeight).clamp(0, 100);
    return AcademicSimulation(
      examName: examName,
      currentAverage: currentAverage,
      targetAverage: targetAverage,
      requiredFinalScore: required.toDouble(),
    );
  }
}
