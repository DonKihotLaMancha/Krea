import '../../data/models/study_models.dart';

class MedicalEvidenceService {
  List<MedicalSource> baselineSources() {
    return const [
      MedicalSource(
        title: 'Resistance Training and Muscle Hypertrophy',
        year: 2010,
        link: 'https://pubmed.ncbi.nlm.nih.gov/20847704/',
        confidence: 0.88,
      ),
      MedicalSource(
        title: 'Protein intake and exercise adaptations',
        year: 2018,
        link: 'https://pubmed.ncbi.nlm.nih.gov/28698222/',
        confidence: 0.84,
      ),
    ];
  }
}
