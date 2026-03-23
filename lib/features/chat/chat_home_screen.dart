import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';
import '../../data/models/study_models.dart';

class ChatHomeScreen extends ConsumerStatefulWidget {
  const ChatHomeScreen({super.key});

  @override
  ConsumerState<ChatHomeScreen> createState() => _ChatHomeScreenState();
}

class _ChatHomeScreenState extends ConsumerState<ChatHomeScreen> {
  final _msgCtrl = TextEditingController();
  String _room = 'global';

  @override
  void dispose() {
    _msgCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final messages = ref.read(appControllerProvider.notifier).roomMessages(_room);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'global', label: Text('Global')),
              ButtonSegment(value: 'private_alex', label: Text('Private')),
              ButtonSegment(value: 'group_math', label: Text('Class Group')),
            ],
            selected: {_room},
            onSelectionChanged: (value) => setState(() => _room = value.first),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView(
              children: messages
                  .map(
                    (ChatMessage m) => ListTile(
                      title: Text('${m.sender}: ${m.content}'),
                      subtitle: Text(m.createdAt.toIso8601String()),
                    ),
                  )
                  .toList(),
            ),
          ),
          TextField(controller: _msgCtrl, decoration: const InputDecoration(labelText: 'Message')),
          FilledButton(
            onPressed: () async {
              final text = _msgCtrl.text.trim();
              if (text.isEmpty) return;
              await ref.read(appControllerProvider.notifier).sendChat(
                    _room,
                    'You',
                    text,
                    isPrivate: _room.startsWith('private'),
                  );
              if (mounted) {
                setState(() {
                  _msgCtrl.clear();
                });
              }
            },
            child: const Text('Send'),
          ),
        ],
      ),
    );
  }
}
