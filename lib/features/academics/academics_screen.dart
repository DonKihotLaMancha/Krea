import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';
import '../../data/models/study_models.dart';

class AcademicsScreen extends ConsumerStatefulWidget {
  const AcademicsScreen({super.key});

  @override
  ConsumerState<AcademicsScreen> createState() => _AcademicsScreenState();
}

class _AcademicsScreenState extends ConsumerState<AcademicsScreen> {
  final _subjectCtrl = TextEditingController(text: 'Mathematics');
  final _scoreCtrl = TextEditingController(text: '85');
  final _weightCtrl = TextEditingController(text: '0.3');
  final _targetCtrl = TextEditingController(text: '90');
  final _finalWeightCtrl = TextEditingController(text: '0.4');

  @override
  void dispose() {
    _subjectCtrl.dispose();
    _scoreCtrl.dispose();
    _weightCtrl.dispose();
    _targetCtrl.dispose();
    _finalWeightCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
    final avg = ref.read(appControllerProvider.notifier).weightedAverage();
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          TextField(controller: _subjectCtrl, decoration: const InputDecoration(labelText: 'Subject')),
          TextField(controller: _scoreCtrl, decoration: const InputDecoration(labelText: 'Score')),
          TextField(controller: _weightCtrl, decoration: const InputDecoration(labelText: 'Weight (0-1)')),
          FilledButton(
            onPressed: () {
              ref.read(appControllerProvider.notifier).addGrade(
                    GradeEntry(
                      subject: _subjectCtrl.text,
                      score: double.tryParse(_scoreCtrl.text) ?? 0,
                      weight: double.tryParse(_weightCtrl.text) ?? 0,
                    ),
                  );
            },
            child: const Text('Add grade'),
          ),
          const SizedBox(height: 8),
          Text('Current weighted average: ${avg.toStringAsFixed(2)}'),
          const Divider(),
          TextField(controller: _targetCtrl, decoration: const InputDecoration(labelText: 'Target final average')),
          TextField(controller: _finalWeightCtrl, decoration: const InputDecoration(labelText: 'Final exam weight')),
          FilledButton.tonal(
            onPressed: () {
              ref.read(appControllerProvider.notifier).simulateExam(
                    'Final exam',
                    double.tryParse(_targetCtrl.text) ?? 90,
                    double.tryParse(_finalWeightCtrl.text) ?? 0.4,
                  );
            },
            child: const Text('Simulate final outcome'),
          ),
          const Divider(),
          Expanded(
            child: ListView(
              children: [
                ...state.grades.map((g) => ListTile(title: Text(g.subject), subtitle: Text('${g.score} @ ${g.weight}'))),
                ...state.simulations.map((s) => ListTile(
                      title: Text(s.examName),
                      subtitle: Text('Need ${s.requiredFinalScore.toStringAsFixed(1)} to reach ${s.targetAverage}'),
                    )),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
