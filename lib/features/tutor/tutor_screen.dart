import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/app_repository.dart';

class TutorScreen extends ConsumerStatefulWidget {
  const TutorScreen({super.key});

  @override
  ConsumerState<TutorScreen> createState() => _TutorScreenState();
}

class _TutorScreenState extends ConsumerState<TutorScreen> {
  final _promptCtrl = TextEditingController();
  final List<String> _messages = [];
  bool _loading = false;

  @override
  void dispose() {
    _promptCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          const ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('AI Tutor (mock provider)'),
            subtitle: Text('Cloud API integration can be added later via provider settings.'),
          ),
          TextField(
            controller: _promptCtrl,
            decoration: const InputDecoration(
              labelText: 'Ask for guidance',
              border: OutlineInputBorder(),
            ),
            maxLines: 3,
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _loading
                ? null
                : () async {
                    final prompt = _promptCtrl.text.trim();
                    if (prompt.isEmpty) return;
                    setState(() {
                      _messages.add('You: $prompt');
                      _loading = true;
                    });
                    final repo = ref.read(appRepositoryProvider);
                    final reply = await repo.aiProvider.tutorReply(prompt);
                    if (mounted) {
                      setState(() {
                        _messages.add('Tutor: $reply');
                        _loading = false;
                        _promptCtrl.clear();
                      });
                    }
                  },
            child: Text(_loading ? 'Thinking...' : 'Send'),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: ListView(
              children: _messages.map((m) => ListTile(title: Text(m))).toList(),
            ),
          ),
        ],
      ),
    );
  }
}
