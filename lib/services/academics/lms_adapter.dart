abstract class LmsAdapter {
  Future<List<Map<String, dynamic>>> fetchAssignments();
  Future<List<Map<String, dynamic>>> fetchGrades();
}

class StubLmsAdapter implements LmsAdapter {
  @override
  Future<List<Map<String, dynamic>>> fetchAssignments() async => [];

  @override
  Future<List<Map<String, dynamic>>> fetchGrades() async => [];
}
