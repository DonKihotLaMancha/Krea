import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';
import '../../data/models/study_models.dart';

class ConceptMapsScreen extends ConsumerStatefulWidget {
  const ConceptMapsScreen({super.key});

  @override
  ConsumerState<ConceptMapsScreen> createState() => _ConceptMapsScreenState();
}

class _ConceptMapsScreenState extends ConsumerState<ConceptMapsScreen> {
  List<ConceptNode> _nodes = [];
  bool _loading = false;

  @override
  Widget build(BuildContext context) {
    final chunks = ref.watch(appControllerProvider).chunks;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FilledButton(
            onPressed: chunks.isEmpty || _loading
                ? null
                : () async {
                    setState(() => _loading = true);
                    final nodes = await ref.read(appControllerProvider.notifier).buildConceptMap(chunks.first);
                    if (mounted) {
                      setState(() {
                        _nodes = nodes;
                        _loading = false;
                      });
                    }
                  },
            child: Text(_loading ? 'Building...' : 'Generate Concept Map'),
          ),
          const SizedBox(height: 12),
          const Text('Nodes include title, description, and image hint.'),
          const SizedBox(height: 12),
          Expanded(
            child: _nodes.isEmpty
                ? const Center(child: Text('Ingest content first, then generate concepts.'))
                : ListView.builder(
                    itemCount: _nodes.length,
                    itemBuilder: (context, index) {
                      final node = _nodes[index];
                      return Card(
                        child: ListTile(
                          leading: const Icon(Icons.image_outlined),
                          title: Text(node.title),
                          subtitle: Text('${node.description}\n${node.imageHint}'),
                          isThreeLine: true,
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
