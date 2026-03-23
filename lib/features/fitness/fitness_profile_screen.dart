import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';
import '../../data/models/study_models.dart';

class FitnessProfileScreen extends ConsumerStatefulWidget {
  const FitnessProfileScreen({super.key});

  @override
  ConsumerState<FitnessProfileScreen> createState() => _FitnessProfileScreenState();
}

class _FitnessProfileScreenState extends ConsumerState<FitnessProfileScreen> {
  final _ageCtrl = TextEditingController(text: '20');
  final _weightCtrl = TextEditingController(text: '70');
  final _heightCtrl = TextEditingController(text: '175');
  final _goalCtrl = TextEditingController(text: 'muscle gain');
  final _prefCtrl = TextEditingController(text: 'gym 4x/week');

  @override
  void dispose() {
    _ageCtrl.dispose();
    _weightCtrl.dispose();
    _heightCtrl.dispose();
    _goalCtrl.dispose();
    _prefCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(appControllerProvider).fitnessProfile;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          TextField(controller: _ageCtrl, decoration: const InputDecoration(labelText: 'Age')),
          TextField(controller: _weightCtrl, decoration: const InputDecoration(labelText: 'Weight (kg)')),
          TextField(controller: _heightCtrl, decoration: const InputDecoration(labelText: 'Height (cm)')),
          TextField(controller: _goalCtrl, decoration: const InputDecoration(labelText: 'Goal')),
          TextField(controller: _prefCtrl, decoration: const InputDecoration(labelText: 'Training preference')),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: () {
              ref.read(appControllerProvider.notifier).setFitnessProfile(
                    FitnessProfile(
                      age: int.tryParse(_ageCtrl.text) ?? 20,
                      weightKg: double.tryParse(_weightCtrl.text) ?? 70,
                      heightCm: double.tryParse(_heightCtrl.text) ?? 175,
                      goal: _goalCtrl.text.trim(),
                      preference: _prefCtrl.text.trim(),
                    ),
                  );
            },
            child: const Text('Save profile'),
          ),
          const SizedBox(height: 8),
          if (profile != null)
            ListTile(
              title: Text('Saved: ${profile.goal}'),
              subtitle: Text('${profile.age}y, ${profile.weightKg}kg, ${profile.heightCm}cm'),
            ),
        ],
      ),
    );
  }
}
