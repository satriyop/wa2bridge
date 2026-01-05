/**
 * Conversation Memory
 *
 * Tracks conversation context per contact.
 * Helps maintain natural conversation flow.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { LRUMap } from '../../utils/lru-map.js';

export class ConversationMemory {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.maxMessages = options.maxMessages || 20;
    this.maxContacts = options.maxContacts || 500; // Limit contacts to prevent unbounded growth
    this.conversations = new LRUMap(this.maxContacts);

    this.loadState();
  }

  recordMessage(contact, message, direction = 'received') {
    const conversation = this.conversations.get(contact) || {
      messages: [],
      lastActivity: null,
      topics: [],
      sentiment: 'neutral',
    };

    conversation.messages.push({
      text: message.text || message,
      direction,
      timestamp: Date.now(),
    });

    if (conversation.messages.length > this.maxMessages) {
      conversation.messages = conversation.messages.slice(-this.maxMessages);
    }

    conversation.lastActivity = Date.now();

    this.updateTopics(conversation, message.text || message);
    this.updateSentiment(conversation, message.text || message);

    this.conversations.set(contact, conversation);
    this.saveState();
  }

  getContext(contact) {
    const conversation = this.conversations.get(contact);
    if (!conversation) {
      return {
        isNew: true,
        messageCount: 0,
        lastActivity: null,
        topics: [],
        sentiment: 'neutral',
      };
    }

    return {
      isNew: false,
      messageCount: conversation.messages.length,
      lastActivity: conversation.lastActivity,
      lastMessage: conversation.messages[conversation.messages.length - 1],
      topics: conversation.topics,
      sentiment: conversation.sentiment,
      timeSinceLastMessage: Date.now() - conversation.lastActivity,
    };
  }

  isActiveConversation(contact) {
    const context = this.getContext(contact);
    if (context.isNew) return false;

    return context.timeSinceLastMessage < 10 * 60 * 1000;
  }

  updateTopics(conversation, text) {
    if (!text) return;

    const topics = [];
    const lowerText = text.toLowerCase();

    const topicPatterns = {
      work: /kerja|kantor|project|meeting|deadline|boss/i,
      money: /uang|bayar|harga|murah|mahal|transfer|rupiah/i,
      food: /makan|lapar|resto|makanan|masak/i,
      health: /sakit|sehat|dokter|rumah sakit|obat/i,
      family: /keluarga|mama|papa|anak|istri|suami/i,
      travel: /jalan|liburan|pergi|pulang|sampai/i,
    };

    for (const [topic, pattern] of Object.entries(topicPatterns)) {
      if (pattern.test(lowerText)) {
        topics.push(topic);
      }
    }

    conversation.topics = [...new Set([...conversation.topics, ...topics])].slice(-5);
  }

  updateSentiment(conversation, text) {
    if (!text) return;

    const lowerText = text.toLowerCase();

    const positiveWords = /bagus|senang|baik|terima kasih|makasih|suka|love|mantap|keren|oke|yes|iya|🙂|😊|❤️|👍|🎉/i;
    const negativeWords = /tidak|bukan|salah|marah|kesal|sedih|gagal|buruk|jelek|😢|😡|😔|👎/i;

    if (positiveWords.test(lowerText)) {
      conversation.sentiment = 'positive';
    } else if (negativeWords.test(lowerText)) {
      conversation.sentiment = 'negative';
    }
  }

  getActiveConversations() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const active = [];

    for (const [contact, conv] of this.conversations) {
      if (conv.lastActivity > oneHourAgo) {
        active.push({ contact, ...this.getContext(contact) });
      }
    }

    return active;
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.conversation-memory.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        if (data.savedAt > Date.now() - 24 * 60 * 60 * 1000) {
          // Populate LRUMap from saved data (respects maxContacts limit)
          for (const [contact, conv] of Object.entries(data.conversations || {})) {
            this.conversations.set(contact, conv);
          }
        }
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.conversation-memory.json');
    try {
      const obj = {};
      for (const [k, v] of this.conversations) {
        obj[k] = v;
      }
      writeFileSync(stateFile, JSON.stringify({
        conversations: obj,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default ConversationMemory;
