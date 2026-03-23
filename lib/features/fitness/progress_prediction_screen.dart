import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';

class ProgressPredictionScreen extends ConsumerStatefulWidget {
  const ProgressPredictionScreen({super.key});

  @override
  ConsumerState<ProgressPredictionScreen> createState() => _ProgressPredictionScreenState();
}

class _ProgressPredictionScreenState extends ConsumerState<ProgressPredictionScreen> {
  final _adherenceCtrl = TextEditingController(text: '80');

  @override
  void dispose() {
    _adherenceCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final prediction = ref.watch(appControllerProvider).progressPrediction;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Estimate only. Not medical diagnosis.'),
          TextField(
            controller: _adherenceCtrl,
            decoration: const InputDecoration(labelText: 'Adherence %'),
          ),
          FilledButton(
            onPressed: () {
              final adherence = int.tryParse(_adherenceCtrl.text) ?? 70;
              ref.read(appControllerProvider.notifier).computePrediction(adherence);
            },
            child: const Text('Estimate progress'),
          ),
          const SizedBox(height: 8),
          if (prediction != null) ...[
            Text(prediction.summary),
            Text('Expected weight change: ${prediction.expectedWeightChangeKg.toStringAsFixed(2)} kg'),
            Text('Expected muscle gain: ${prediction.expectedMuscleGainKg.toStringAsFixed(2)} kg'),
            const SizedBox(height: 8),
            const Text('Evidence sources:'),
            ...prediction.sources.map((s) => Text('- ${s.title} (${s.year}) ${s.link}')),
          ],
        ],
      ),
    );
  }
}
