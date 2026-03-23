import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';
import '../../services/ingest/document_ingest_service.dart';
import '../../services/ingest/video_ingest_service.dart';

class IngestionScreen extends ConsumerStatefulWidget {
  const IngestionScreen({super.key});

  @override
  ConsumerState<IngestionScreen> createState() => _IngestionScreenState();
}

class _IngestionScreenState extends ConsumerState<IngestionScreen> {
  final _docService = DocumentIngestService();
  final _videoService = VideoIngestService();

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            children: [
              FilledButton(
                onPressed: () async {
                  final chunk = await _docService.pickAndExtract();
                  if (chunk != null && mounted) {
                    ref.read(appControllerProvider.notifier).addChunk(chunk);
                  }
                },
                child: const Text('Upload PDF/Document'),
              ),
              FilledButton.tonal(
                onPressed: () async {
                  final chunk = await _videoService.pickAndExtractTranscript();
                  if (chunk != null && mounted) {
                    ref.read(appControllerProvider.notifier).addChunk(chunk);
                  }
                },
                child: const Text('Upload Video'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text('Ingested Content'),
          const SizedBox(height: 8),
          Expanded(
            child: ListView.builder(
              itemCount: state.chunks.length,
              itemBuilder: (context, index) {
                final chunk = state.chunks[index];
                return Card(
                  child: ListTile(
                    title: Text(chunk.title),
                    subtitle: Text(
                      '${chunk.sourceType}: ${chunk.content}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.auto_awesome),
                      onPressed: () => ref.read(appControllerProvider.notifier).generateFlashcards(chunk),
                    ),
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
