import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:student_assistant/features/academics/academics_screen.dart';
import 'package:student_assistant/features/chat/chat_home_screen.dart';
import 'package:student_assistant/features/challenges/challenges_screen.dart';
import 'package:student_assistant/features/concept_maps/concept_maps_screen.dart';
import 'package:student_assistant/features/dashboard/dashboard_screen.dart';
import 'package:student_assistant/features/diet/diet_plan_screen.dart';
import 'package:student_assistant/features/exams/exams_screen.dart';
import 'package:student_assistant/features/flashcards/flashcards_screen.dart';
import 'package:student_assistant/features/fitness/fitness_profile_screen.dart';
import 'package:student_assistant/features/fitness/progress_prediction_screen.dart';
import 'package:student_assistant/features/fitness/progress_screen.dart';
import 'package:student_assistant/features/fitness/workout_plan_screen.dart';
import 'package:student_assistant/features/ingestion/ingestion_screen.dart';
import 'package:student_assistant/features/nutrition/nutrition_screen.dart';
import 'package:student_assistant/features/presentations/presentation_builder_screen.dart';
import 'package:student_assistant/features/tasks/tasks_screen.dart';
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
    DashboardScreen(),
    IngestionScreen(),
    FlashcardsScreen(),
    TasksScreen(),
    ExamsScreen(),
    ChatHomeScreen(),
    ChallengesScreen(),
    FitnessProfileScreen(),
    WorkoutPlanScreen(),
    ProgressScreen(),
    DietPlanScreen(),
    ProgressPredictionScreen(),
    NutritionScreen(),
    PresentationBuilderScreen(),
    AcademicsScreen(),
    TutorScreen(),
    ConceptMapsScreen(),
  ];

  static const _labels = [
    'Dashboard',
    'Ingest',
    'Flashcards',
    'Tasks',
    'Exams',
    'Chat',
    'Challenges',
    'Fitness Profile',
    'Workout Plan',
    'Progress',
    'Diet',
    'Prediction',
    'Nutrition',
    'Presentations',
    'Academics',
    'Tutor',
    'Concept Maps',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Student Assistant - ${_labels[_index]}')),
      body: _pages[_index],
      drawer: Drawer(
        child: ListView.builder(
          itemCount: _labels.length,
          itemBuilder: (context, i) {
            return ListTile(
              title: Text(_labels[i]),
              selected: i == _index,
              onTap: () {
                setState(() => _index = i);
                Navigator.pop(context);
              },
            );
          },
        ),
      ),
    );
  }
}
