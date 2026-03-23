import '../../data/models/study_models.dart';

class DietRecommendationService {
  DietRecommendation buildPlan(FitnessProfile profile) {
    final maintenance = (profile.weightKg * 30).round();
    final calories = profile.goal.toLowerCase().contains('loss') ? maintenance - 300 : maintenance + 200;
    final protein = (profile.weightKg * 2).round();
    final fats = (calories * 0.25 / 9).round();
    final carbs = ((calories - (protein * 4) - (fats * 9)) / 4).round();
    return DietRecommendation(
      calories: calories,
      protein: protein,
      carbs: carbs,
      fats: fats,
      note: 'Estimated plan. Adjust every 2-3 weeks based on real progress.',
    );
  }
}
