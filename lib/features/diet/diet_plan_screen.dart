import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_controller.dart';

class DietPlanScreen extends ConsumerWidget {
  const DietPlanScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final diet = ref.watch(appControllerProvider).dietRecommendation;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: diet == null
          ? const Center(child: Text('Set fitness profile first to generate diet recommendation.'))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Calories: ${diet.calories} kcal'),
                Text('Protein: ${diet.protein} g'),
                Text('Carbs: ${diet.carbs} g'),
                Text('Fats: ${diet.fats} g'),
                const SizedBox(height: 8),
                Text(diet.note),
              ],
            ),
    );
  }
}
