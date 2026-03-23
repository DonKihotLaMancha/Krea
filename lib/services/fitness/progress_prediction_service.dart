import '../../data/models/study_models.dart';
import 'medical_evidence_service.dart';

class ProgressPredictionService {
  ProgressPredictionService(this._medicalEvidenceService);

  final MedicalEvidenceService _medicalEvidenceService;

  ProgressPrediction estimate({
    required FitnessProfile profile,
    required int adherencePercent,
  }) {
    final adherence = adherencePercent.clamp(0, 100) / 100;
    final expectedMuscle = (0.7 * adherence);
    final expectedWeight = profile.goal.toLowerCase().contains('loss') ? -(0.5 * adherence) : (0.3 * adherence);
    final summary = adherencePercent < 70
        ? 'Progress may be slower due to inconsistent training or diet adherence.'
        : 'Consistent adherence indicates likely measurable progress over 4 weeks.';
    return ProgressPrediction(
      summary: summary,
      expectedWeightChangeKg: expectedWeight,
      expectedMuscleGainKg: expectedMuscle,
      sources: _medicalEvidenceService.baselineSources(),
    );
  }
}
