import 'package:flutter_test/flutter_test.dart';
import 'package:student_assistant/data/models/study_models.dart';
import 'package:student_assistant/services/academics/exam_simulation_service.dart';
import 'package:student_assistant/services/academics/gradebook_service.dart';
import 'package:student_assistant/services/fitness/diet_recommendation_service.dart';
import 'package:student_assistant/services/fitness/medical_evidence_service.dart';
import 'package:student_assistant/services/fitness/progress_prediction_service.dart';

void main() {
  test('gradebook computes weighted average', () {
    final service = GradebookService();
    final avg = service.computeWeightedAverage(
      const [
        GradeEntry(subject: 'Math', score: 80, weight: 0.4),
        GradeEntry(subject: 'Science', score: 90, weight: 0.6),
      ],
    );
    expect(avg, 86);
  });

  test('exam simulation returns required score', () {
    final service = ExamSimulationService();
    final sim = service.simulate(
      examName: 'Final',
      currentAverage: 75,
      targetAverage: 85,
      finalWeight: 0.5,
    );
    expect(sim.requiredFinalScore, 95);
  });

  test('diet recommendation is generated', () {
    final service = DietRecommendationService();
    final plan = service.buildPlan(
      const FitnessProfile(
        age: 21,
        weightKg: 70,
        heightCm: 175,
        goal: 'muscle gain',
        preference: 'gym',
      ),
    );
    expect(plan.calories, greaterThan(0));
    expect(plan.protein, greaterThan(0));
  });

  test('progress prediction includes medical sources', () {
    final service = ProgressPredictionService(MedicalEvidenceService());
    final prediction = service.estimate(
      profile: const FitnessProfile(
        age: 21,
        weightKg: 70,
        heightCm: 175,
        goal: 'fat loss',
        preference: 'home',
      ),
      adherencePercent: 80,
    );
    expect(prediction.sources.isNotEmpty, true);
  });
}
