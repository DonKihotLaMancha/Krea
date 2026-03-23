import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';

class FlashcardsScreen extends ConsumerStatefulWidget {
  const FlashcardsScreen({super.key});

  @override
  ConsumerState<FlashcardsScreen> createState() => _FlashcardsScreenState();
}

class _FlashcardsScreenState extends ConsumerState<FlashcardsScreen> {
  final _revealed = <String>{};

  @override
  Widget build(BuildContext context) {
    final cards = ref.watch(appControllerProvider).flashcards;
    if (cards.isEmpty) {
      return const Center(
        child: Text('No flashcards yet. Ingest content and tap the sparkle button.'),
      );
    }
    final current = cards.first;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Cards: ${cards.length}'),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(current.question, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 12),
                  if (_revealed.contains(current.id)) Text(current.answer),
                  if (!_revealed.contains(current.id))
                    OutlinedButton(
                      onPressed: () => setState(() => _revealed.add(current.id)),
                      child: const Text('Reveal answer'),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.tonal(
                  onPressed: () {
                    ref.read(appControllerProvider.notifier).markFlashcard(current.id, false);
                    setState(() => _revealed.remove(current.id));
                  },
                  child: const Text('I got it wrong'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  onPressed: () {
                    ref.read(appControllerProvider.notifier).markFlashcard(current.id, true);
                    setState(() => _revealed.remove(current.id));
                  },
                  child: const Text('I got it right'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text('Queue (wrong answers are re-prioritized):'),
          Expanded(
            child: ListView(
              children: cards
                  .take(8)
                  .map(
                    (c) => ListTile(
                      title: Text(c.question, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text('Right ${c.rightCount} | Wrong ${c.wrongCount}'),
                    ),
                  )
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }
}
