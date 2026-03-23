import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';

class ExamsScreen extends ConsumerStatefulWidget {
  const ExamsScreen({super.key});

  @override
  ConsumerState<ExamsScreen> createState() => _ExamsScreenState();
}

class _ExamsScreenState extends ConsumerState<ExamsScreen> {
  final _topicCtrl = TextEditingController(text: 'Math');
  final _totalCtrl = TextEditingController(text: '20');
  Timer? _timer;
  int _seconds = 0;

  @override
  void dispose() {
    _timer?.cancel();
    _topicCtrl.dispose();
    _totalCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(appControllerProvider).quizResults;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          TextField(controller: _topicCtrl, decoration: const InputDecoration(labelText: 'Quiz topic')),
          TextField(controller: _totalCtrl, decoration: const InputDecoration(labelText: 'Questions')),
          const SizedBox(height: 8),
          Text('Timer: $_seconds s'),
          Wrap(
            spacing: 8,
            children: [
              FilledButton(
                onPressed: () {
                  _timer?.cancel();
                  _timer = Timer.periodic(const Duration(seconds: 1), (_) {
                    if (mounted) setState(() => _seconds += 1);
                  });
                },
                child: const Text('Start quiz'),
              ),
              FilledButton.tonal(
                onPressed: () {
                  _timer?.cancel();
                  final total = int.tryParse(_totalCtrl.text) ?? 20;
                  final correct = (total * 0.75).round();
                  ref
                      .read(appControllerProvider.notifier)
                      .addQuizResult(_topicCtrl.text, total, correct, Duration(seconds: _seconds));
                  setState(() => _seconds = 0);
                },
                child: const Text('Finish and score'),
              ),
            ],
          ),
          const Divider(),
          Expanded(
            child: ListView(
              children: results
                  .map((r) => ListTile(
                        title: Text(r.topic),
                        subtitle: Text('Score ${r.correct}/${r.total} in ${r.elapsed.inSeconds}s'),
                      ))
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }
}
