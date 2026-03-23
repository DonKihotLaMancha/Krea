import '../../data/models/study_models.dart';

class GradebookService {
  double computeWeightedAverage(List<GradeEntry> grades) {
    if (grades.isEmpty) return 0;
    final weightSum = grades.fold<double>(0, (sum, g) => sum + g.weight);
    if (weightSum == 0) return 0;
    final total = grades.fold<double>(0, (sum, g) => sum + (g.score * g.weight));
    return total / weightSum;
  }
}
