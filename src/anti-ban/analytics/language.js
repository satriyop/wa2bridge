/**
 * Language Detector
 *
 * Detects message language and tracks language preferences.
 * Helps respond in the same language as the sender.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class LanguageDetector {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.contactLanguages = new Map();

    this.patterns = {
      id: {
        name: 'Indonesian',
        indicators: [
          /\b(apa|siapa|kapan|dimana|bagaimana|kenapa|berapa)\b/i,
          /\b(saya|kamu|anda|dia|mereka|kami|kita)\b/i,
          /\b(yang|dan|atau|tapi|dengan|untuk|dari)\b/i,
          /\b(tidak|bukan|jangan|belum|sudah|akan)\b/i,
          /\b(terima kasih|makasih|tolong|mohon|maaf)\b/i,
          /\b(selamat|pagi|siang|sore|malam)\b/i,
          /\b(bisa|mau|ingin|perlu|harus)\b/i,
        ],
      },
      en: {
        name: 'English',
        indicators: [
          /\b(what|who|when|where|how|why|which)\b/i,
          /\b(i|you|he|she|they|we|it)\b/i,
          /\b(the|and|or|but|with|for|from)\b/i,
          /\b(don't|can't|won't|isn't|aren't)\b/i,
          /\b(please|thank|sorry|excuse|welcome)\b/i,
          /\b(good|morning|afternoon|evening|night)\b/i,
          /\b(can|want|need|must|should)\b/i,
        ],
      },
    };

    this.loadState();
  }

  detect(text) {
    if (!text || text.length < 5) {
      return { language: null, confidence: 0 };
    }

    const scores = {};

    for (const [lang, config] of Object.entries(this.patterns)) {
      let matches = 0;
      for (const pattern of config.indicators) {
        if (pattern.test(text)) {
          matches++;
        }
      }
      scores[lang] = matches / config.indicators.length;
    }

    let detectedLang = null;
    let maxScore = 0;

    for (const [lang, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedLang = lang;
      }
    }

    if (maxScore < 0.1) {
      return { language: null, confidence: 0 };
    }

    return {
      language: detectedLang,
      name: this.patterns[detectedLang]?.name,
      confidence: Math.round(maxScore * 100),
    };
  }

  recordContactLanguage(contact, text) {
    const detection = this.detect(text);
    if (!detection.language) return;

    const existing = this.contactLanguages.get(contact) || {
      languages: {},
      primary: null,
      messageCount: 0,
    };

    existing.languages[detection.language] = (existing.languages[detection.language] || 0) + 1;
    existing.messageCount++;

    let maxCount = 0;
    for (const [lang, count] of Object.entries(existing.languages)) {
      if (count > maxCount) {
        maxCount = count;
        existing.primary = lang;
      }
    }

    this.contactLanguages.set(contact, existing);
    this.saveState();
  }

  getContactLanguage(contact) {
    const data = this.contactLanguages.get(contact);
    if (!data || !data.primary) {
      return { language: 'id', name: 'Indonesian', confidence: 0 };
    }

    const totalMessages = data.messageCount;
    const primaryCount = data.languages[data.primary];
    const confidence = Math.round((primaryCount / totalMessages) * 100);

    return {
      language: data.primary,
      name: this.patterns[data.primary]?.name || data.primary,
      confidence,
    };
  }

  isMatchingLanguage(contact, text) {
    const preferredLang = this.getContactLanguage(contact);
    const messageLang = this.detect(text);

    if (!messageLang.language) return true;
    if (!preferredLang.language) return true;

    return messageLang.language === preferredLang.language;
  }

  getStats() {
    return {
      trackedContacts: this.contactLanguages.size,
      languages: ['id', 'en'],
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.language-detector-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.contactLanguages = new Map(Object.entries(data.contactLanguages || {}));
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.language-detector-state.json');
    try {
      const obj = {};
      for (const [k, v] of this.contactLanguages) {
        obj[k] = v;
      }
      writeFileSync(stateFile, JSON.stringify({
        contactLanguages: obj,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default LanguageDetector;
