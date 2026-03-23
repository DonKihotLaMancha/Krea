import '../../data/models/study_models.dart';

abstract class ChatBackendAdapter {
  Future<List<ChatMessage>> fetchRoomMessages(String roomId);
  Future<void> sendMessage(ChatMessage message);
}
