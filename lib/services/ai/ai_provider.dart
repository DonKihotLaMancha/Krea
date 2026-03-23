abstract class AiProvider {
  Future<String> tutorReply(String prompt);
  Future<List<String>> extractConcepts(String content);
}

class MockAiProvider implements AiProvider {
  @override
  Future<List<String>> extractConcepts(String content) async {
    final words = content
        .split(' ')
        .where((w) => w.length > 6)
        .take(5)
        .map((e) => e.toLowerCase())
        .toSet()
        .toList();
    return words.isEmpty ? ['learning', 'practice', 'review'] : words;
  }

  @override
  Future<String> tutorReply(String prompt) async {
    return 'Tutor guidance: break this into small tasks, test yourself with active recall, and review wrong answers first.';
  }
}
