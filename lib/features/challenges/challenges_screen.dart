import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';
import '../../data/models/study_models.dart';

class ChallengesScreen extends ConsumerStatefulWidget {
  const ChallengesScreen({super.key});

  @override
  ConsumerState<ChallengesScreen> createState() => _ChallengesScreenState();
}

class _ChallengesScreenState extends ConsumerState<ChallengesScreen> {
  final _topicCtrl = TextEditingController(text: 'Biology');
  final _questionsCtrl = TextEditingController(text: '10');
  Timer? _timer;
  int _seconds = 0;
  bool _running = false;

  @override
  void dispose() {
    _timer?.cancel();
    _topicCtrl.dispose();
    _questionsCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(appControllerProvider).challengeResults;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          TextField(controller: _topicCtrl, decoration: const InputDecoration(labelText: 'Topic')),
          TextField(
            controller: _questionsCtrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Number of questions'),
          ),
          const SizedBox(height: 8),
          Text('Elapsed: $_seconds s', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              FilledButton(
                onPressed: _running
                    ? null
                    : () {
                        setState(() => _running = true);
                        _timer = Timer.periodic(const Duration(seconds: 1), (_) {
                          if (mounted) setState(() => _seconds += 1);
                        });
                      },
                child: const Text('Start'),
              ),
              FilledButton.tonal(
                onPressed: !_running
                    ? null
                    : () {
                        _timer?.cancel();
                        setState(() => _running = false);
                      },
                child: const Text('Pause'),
              ),
              OutlinedButton(
                onPressed: () => setState(() => _seconds = 0),
                child: const Text('Reset'),
              ),
              FilledButton(
                onPressed: () {
                  _timer?.cancel();
                  setState(() => _running = false);
                  final total = int.tryParse(_questionsCtrl.text) ?? 10;
                  final result = ChallengeResult(
                    topic: _topicCtrl.text.trim().isEmpty ? 'General' : _topicCtrl.text.trim(),
                    questions: total,
                    elapsed: Duration(seconds: _seconds),
                    correct: (total * 0.7).round(),
                  );
                  ref.read(appControllerProvider.notifier).addChallenge(result);
                },
                child: const Text('Finish challenge'),
              ),
            ],
          ),
          const Divider(height: 24),
          Expanded(
            child: ListView.builder(
              itemCount: results.length,
              itemBuilder: (context, i) {
                final r = results[i];
                return ListTile(
                  title: Text(r.topic),
                  subtitle: Text('Correct ${r.correct}/${r.questions} in ${r.elapsed.inSeconds}s'),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
