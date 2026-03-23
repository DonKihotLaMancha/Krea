import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';
import '../../data/models/study_models.dart';

class NutritionScreen extends ConsumerStatefulWidget {
  const NutritionScreen({super.key});

  @override
  ConsumerState<NutritionScreen> createState() => _NutritionScreenState();
}

class _NutritionScreenState extends ConsumerState<NutritionScreen> {
  final _calGoalCtrl = TextEditingController(text: '2200');
  final _proteinGoalCtrl = TextEditingController(text: '140');
  final _daysCtrl = TextEditingController(text: '30');
  final _calCtrl = TextEditingController(text: '500');
  final _proteinCtrl = TextEditingController(text: '30');

  @override
  void dispose() {
    _calGoalCtrl.dispose();
    _proteinGoalCtrl.dispose();
    _daysCtrl.dispose();
    _calCtrl.dispose();
    _proteinCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final entries = ref.watch(appControllerProvider).nutritionEntries;
    final dayCalGoal = int.tryParse(_calGoalCtrl.text) ?? 0;
    final dayProteinGoal = int.tryParse(_proteinGoalCtrl.text) ?? 0;
    final days = int.tryParse(_daysCtrl.text) ?? 1;
    final totalCalGoal = dayCalGoal * days;
    final totalProteinGoal = dayProteinGoal * days;
    final totalCal = entries.fold<int>(0, (sum, e) => sum + e.calories);
    final totalProtein = entries.fold<int>(0, (sum, e) => sum + e.proteinGrams);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          TextField(controller: _calGoalCtrl, decoration: const InputDecoration(labelText: 'Daily calorie goal')),
          TextField(controller: _proteinGoalCtrl, decoration: const InputDecoration(labelText: 'Daily protein goal (g)')),
          TextField(controller: _daysCtrl, decoration: const InputDecoration(labelText: 'Period (days)')),
          const SizedBox(height: 8),
          Text('Period goals: $totalCalGoal kcal | $totalProteinGoal g protein'),
          const Divider(),
          TextField(controller: _calCtrl, decoration: const InputDecoration(labelText: 'Consumed calories')),
          TextField(controller: _proteinCtrl, decoration: const InputDecoration(labelText: 'Consumed protein (g)')),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: () {
              ref.read(appControllerProvider.notifier).addNutrition(
                    NutritionEntry(
                      date: DateTime.now(),
                      calories: int.tryParse(_calCtrl.text) ?? 0,
                      proteinGrams: int.tryParse(_proteinCtrl.text) ?? 0,
                    ),
                  );
            },
            child: const Text('Log intake'),
          ),
          const SizedBox(height: 8),
          Text('Progress: $totalCal/$totalCalGoal kcal | $totalProtein/$totalProteinGoal g'),
          const Divider(),
          Expanded(
            child: ListView.builder(
              itemCount: entries.length,
              itemBuilder: (_, i) {
                final e = entries[i];
                return ListTile(
                  title: Text('${e.calories} kcal, ${e.proteinGrams} g protein'),
                  subtitle: Text(e.date.toIso8601String().split('T').first),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
