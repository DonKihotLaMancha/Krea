import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';

class WorkoutPlanScreen extends ConsumerStatefulWidget {
  const WorkoutPlanScreen({super.key});

  @override
  ConsumerState<WorkoutPlanScreen> createState() => _WorkoutPlanScreenState();
}

class _WorkoutPlanScreenState extends ConsumerState<WorkoutPlanScreen> {
  final _exerciseCtrl = TextEditingController(text: 'Squat');
  final _minutesCtrl = TextEditingController(text: '30');
  Timer? _timer;
  int _elapsed = 0;

  @override
  void dispose() {
    _timer?.cancel();
    _exerciseCtrl.dispose();
    _minutesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final workouts = ref.watch(appControllerProvider).workoutEntries;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          const Text('Routine: Push/Pull/Legs + cardio 2x/week'),
          TextField(controller: _exerciseCtrl, decoration: const InputDecoration(labelText: 'Exercise')),
          TextField(controller: _minutesCtrl, decoration: const InputDecoration(labelText: 'Minutes')),
          const SizedBox(height: 8),
          Text('Session timer: $_elapsed s'),
          Wrap(
            spacing: 8,
            children: [
              FilledButton(
                onPressed: () {
                  _timer?.cancel();
                  _timer = Timer.periodic(const Duration(seconds: 1), (_) {
                    if (mounted) setState(() => _elapsed += 1);
                  });
                },
                child: const Text('Start timer'),
              ),
              FilledButton.tonal(
                onPressed: () {
                  _timer?.cancel();
                  ref.read(appControllerProvider.notifier).addWorkout(
                        _exerciseCtrl.text,
                        int.tryParse(_minutesCtrl.text) ?? 30,
                      );
                  setState(() => _elapsed = 0);
                },
                child: const Text('Log workout'),
              ),
            ],
          ),
          const Divider(),
          Expanded(
            child: ListView(
              children: workouts
                  .map((w) => ListTile(title: Text(w.exercise), subtitle: Text('${w.minutes} min')))
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }
}
