import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appControllerProvider);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: GridView.count(
        crossAxisCount: 2,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        children: [
          _card('Study chunks', '${state.chunks.length}'),
          _card('Flashcards', '${state.flashcards.length}'),
          _card('Today tasks', '${state.tasks.where((t) => !t.done).length} pending'),
          _card('Quiz attempts', '${state.quizResults.length}'),
          _card('Workout logs', '${state.workoutEntries.length}'),
          _card('Grades', '${state.grades.length}'),
        ],
      ),
    );
  }

  Widget _card(String title, String value) {
    return Card(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title),
            const SizedBox(height: 6),
            Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }
}
