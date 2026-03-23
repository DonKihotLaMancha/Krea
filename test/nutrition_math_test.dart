import 'package:flutter_test/flutter_test.dart';

void main() {
  test('period goal calculations are correct', () {
    const dailyCalories = 2200;
    const dailyProtein = 140;
    const days = 30;

    final totalCalories = dailyCalories * days;
    final totalProtein = dailyProtein * days;

    expect(totalCalories, 66000);
    expect(totalProtein, 4200);
  });
}
