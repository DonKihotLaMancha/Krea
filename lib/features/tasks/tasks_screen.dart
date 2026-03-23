import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';

class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key});

  @override
  ConsumerState<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends ConsumerState<TasksScreen> {
  final _titleCtrl = TextEditingController();
  String _priority = 'medium';

  @override
  void dispose() {
    _titleCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tasks = ref.watch(appControllerProvider).tasks;
    final todayDone = tasks.where((t) => t.done).length;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          TextField(controller: _titleCtrl, decoration: const InputDecoration(labelText: 'Daily task')),
          DropdownButton<String>(
            value: _priority,
            items: const [
              DropdownMenuItem(value: 'low', child: Text('Low')),
              DropdownMenuItem(value: 'medium', child: Text('Medium')),
              DropdownMenuItem(value: 'high', child: Text('High')),
            ],
            onChanged: (value) => setState(() => _priority = value ?? 'medium'),
          ),
          FilledButton(
            onPressed: () {
              final title = _titleCtrl.text.trim();
              if (title.isEmpty) return;
              ref.read(appControllerProvider.notifier).addTask(title, DateTime.now(), _priority);
              _titleCtrl.clear();
            },
            child: const Text('Add task'),
          ),
          const SizedBox(height: 8),
          Text('Productivity: $todayDone/${tasks.length} completed'),
          const Divider(),
          Expanded(
            child: ListView.builder(
              itemCount: tasks.length,
              itemBuilder: (_, i) {
                final task = tasks[i];
                return CheckboxListTile(
                  title: Text(task.title),
                  subtitle: Text('Priority: ${task.priority}'),
                  value: task.done,
                  onChanged: (_) => ref.read(appControllerProvider.notifier).toggleTask(task.id),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
