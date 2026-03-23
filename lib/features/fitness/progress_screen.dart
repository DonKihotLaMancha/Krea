import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';

class ProgressScreen extends ConsumerWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final workouts = ref.watch(appControllerProvider).workoutEntries;
    final totalMinutes = workouts.fold<int>(0, (sum, w) => sum + w.minutes);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          ListTile(
            title: const Text('Workout progress'),
            subtitle: Text('Total sessions: ${workouts.length}, total minutes: $totalMinutes'),
          ),
          const Divider(),
          Expanded(
            child: ListView(
              children: workouts
                  .map((w) => ListTile(title: Text(w.exercise), subtitle: Text(w.date.toIso8601String())))
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }
}
