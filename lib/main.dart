import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:student_assistant/features/challenges/challenges_screen.dart';
import 'package:student_assistant/features/concept_maps/concept_maps_screen.dart';
import 'package:student_assistant/features/flashcards/flashcards_screen.dart';
import 'package:student_assistant/features/ingestion/ingestion_screen.dart';
import 'package:student_assistant/features/nutrition/nutrition_screen.dart';
import 'package:student_assistant/features/tutor/tutor_screen.dart';

void main() {
  runApp(const ProviderScope(child: StudentAssistantApp()));
}

class StudentAssistantApp extends StatelessWidget {
  const StudentAssistantApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Student Assistant',
      theme: ThemeData(colorSchemeSeed: Colors.indigo, useMaterial3: true),
      home: const HomeShell(),
    );
  }
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _pages = [
    IngestionScreen(),
    FlashcardsScreen(),
    ConceptMapsScreen(),
    ChallengesScreen(),
    NutritionScreen(),
    TutorScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Student Assistant')),
      body: _pages[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.upload_file), label: 'Ingest'),
          NavigationDestination(icon: Icon(Icons.style), label: 'Flashcards'),
          NavigationDestination(icon: Icon(Icons.hub), label: 'Concepts'),
          NavigationDestination(icon: Icon(Icons.timer), label: 'Challenges'),
          NavigationDestination(icon: Icon(Icons.fitness_center), label: 'Nutrition'),
          NavigationDestination(icon: Icon(Icons.school), label: 'Tutor'),
        ],
      ),
    );
  }
}
