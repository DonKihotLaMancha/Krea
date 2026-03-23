import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';

class PresentationBuilderScreen extends ConsumerStatefulWidget {
  const PresentationBuilderScreen({super.key});

  @override
  ConsumerState<PresentationBuilderScreen> createState() => _PresentationBuilderScreenState();
}

class _PresentationBuilderScreenState extends ConsumerState<PresentationBuilderScreen> {
  final _topicCtrl = TextEditingController(text: 'Renewable Energy Project');
  final _guidelinesCtrl = TextEditingController(text: '10 slides, include references, 7 minutes max.');
  bool _loading = false;

  @override
  void dispose() {
    _topicCtrl.dispose();
    _guidelinesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final drafts = ref.watch(appControllerProvider).presentations;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          TextField(controller: _topicCtrl, decoration: const InputDecoration(labelText: 'Project topic')),
          TextField(
            controller: _guidelinesCtrl,
            decoration: const InputDecoration(labelText: 'Teacher guidelines'),
            maxLines: 3,
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _loading
                ? null
                : () async {
                    setState(() => _loading = true);
                    await ref
                        .read(appControllerProvider.notifier)
                        .generatePresentation(_topicCtrl.text.trim(), _guidelinesCtrl.text.trim());
                    if (mounted) setState(() => _loading = false);
                  },
            child: Text(_loading ? 'Generating...' : 'Generate presentation'),
          ),
          const Divider(),
          Expanded(
            child: ListView(
              children: drafts
                  .map(
                    (d) => ListTile(
                      title: Text(d.title),
                      subtitle: Text('Slides: ${d.slides.length} | Notes: ${d.speakerNotes.length}'),
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
