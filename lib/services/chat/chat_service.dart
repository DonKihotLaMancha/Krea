import 'package:uuid/uuid.dart';

import '../../data/models/study_models.dart';
import 'chat_backend_adapter.dart';

class LocalChatAdapter implements ChatBackendAdapter {
  final List<ChatMessage> _cache = [];

  @override
  Future<List<ChatMessage>> fetchRoomMessages(String roomId) async {
    return _cache.where((m) => m.roomId == roomId).toList();
  }

  @override
  Future<void> sendMessage(ChatMessage message) async {
    _cache.add(message);
  }
}

class ChatService {
  ChatService(this.adapter);

  final ChatBackendAdapter adapter;
  final _uuid = const Uuid();

  Future<List<ChatMessage>> getMessages(String roomId) => adapter.fetchRoomMessages(roomId);

  Future<void> postMessage({
    required String roomId,
    required String sender,
    required String content,
    bool isPrivate = false,
  }) {
    return adapter.sendMessage(
      ChatMessage(
        id: _uuid.v4(),
        roomId: roomId,
        sender: sender,
        content: content,
        createdAt: DateTime.now(),
        isPrivate: isPrivate,
      ),
    );
  }
}
