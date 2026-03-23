import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:student_assistant/features/flashcards/flashcards_screen.dart';
import 'package:flutter/material.dart';

void main() {
  testWidgets('flashcard screen renders empty state', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: FlashcardsScreen()),
      ),
    );
    expect(find.textContaining('No flashcards yet'), findsOneWidget);
  });
}
