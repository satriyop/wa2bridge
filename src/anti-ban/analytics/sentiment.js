/**
 * Sentiment Detector
 *
 * Basic sentiment analysis.
 * Detects positive, negative, or neutral sentiment in messages.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class SentimentDetector {
  constructor(options = {}) {
    this.positiveWords = new Set([
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
      'happy', 'love', 'like', 'thanks', 'thank', 'appreciate', 'perfect', 'best',
      'nice', 'cool', 'beautiful', 'brilliant', 'helpful', 'yes', 'sure', 'okay',
      'bagus', 'baik', 'mantap', 'keren', 'hebat', 'luar biasa', 'sempurna',
      'senang', 'suka', 'cinta', 'terima kasih', 'makasih', 'oke', 'siap',
      'asik', 'asyik', 'top', 'josss', 'mantul', 'gokil', 'sip',
    ]);

    this.negativeWords = new Set([
      'bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'angry', 'sad',
      'disappointed', 'frustrated', 'annoyed', 'upset', 'problem', 'issue', 'wrong',
      'no', 'not', 'never', 'cant', 'wont', 'fail', 'failed', 'sorry', 'unfortunately',
      'buruk', 'jelek', 'benci', 'marah', 'sedih', 'kecewa', 'kesal', 'frustasi',
      'masalah', 'salah', 'tidak', 'bukan', 'jangan', 'gagal', 'maaf', 'sayang',
      'payah', 'parah', 'zonk', 'ampun', 'waduh', 'aduh',
    ]);

    this.intensifiers = new Set([
      'very', 'really', 'so', 'extremely', 'super', 'totally', 'absolutely',
      'sangat', 'banget', 'sekali', 'amat', 'paling',
    ]);

    this.negators = new Set([
      'not', 'no', 'never', 'dont', "don't", 'doesnt', "doesn't", 'isnt', "isn't",
      'tidak', 'bukan', 'tak', 'gak', 'ga', 'nggak', 'enggak', 'belum',
    ]);

    this.contactSentiment = new Map();
    this.sessionsDir = options.sessionsDir;

    this.loadState();
  }

  analyze(text) {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);

    let positiveScore = 0;
    let negativeScore = 0;
    let intensifierMultiplier = 1;
    let negated = false;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const prevWord = words[i - 1] || '';

      if (this.intensifiers.has(prevWord)) {
        intensifierMultiplier = 1.5;
      }

      if (this.negators.has(prevWord)) {
        negated = true;
      }

      if (this.positiveWords.has(word)) {
        if (negated) {
          negativeScore += intensifierMultiplier;
        } else {
          positiveScore += intensifierMultiplier;
        }
      }

      if (this.negativeWords.has(word)) {
        if (negated) {
          positiveScore += intensifierMultiplier * 0.5;
        } else {
          negativeScore += intensifierMultiplier;
        }
      }

      intensifierMultiplier = 1;
      negated = false;
    }

    const emojiSentiment = this.analyzeEmojis(text);
    positiveScore += emojiSentiment.positive;
    negativeScore += emojiSentiment.negative;

    const total = positiveScore + negativeScore;
    if (total === 0) {
      return { sentiment: 'neutral', score: 0, confidence: 0 };
    }

    const sentimentScore = (positiveScore - negativeScore) / Math.max(total, 1);
    const confidence = Math.min(Math.round(total * 20), 100);

    let sentiment = 'neutral';
    if (sentimentScore > 0.2) sentiment = 'positive';
    else if (sentimentScore < -0.2) sentiment = 'negative';

    return {
      sentiment,
      score: Math.round(sentimentScore * 100) / 100,
      confidence,
      details: {
        positiveScore,
        negativeScore,
        wordCount: words.length,
      },
    };
  }

  analyzeEmojis(text) {
    const positive = (text.match(/[😀😃😄😁😆😊🙂😍🥰❤️💕👍🎉✨🔥💪👏🙏✅]/g) || []).length;
    const negative = (text.match(/[😢😭😤😡🤬😠💔👎❌😞😔😩😫]/g) || []).length;
    return { positive: positive * 0.5, negative: negative * 0.5 };
  }

  recordContactSentiment(contact, text) {
    const analysis = this.analyze(text);
    const existing = this.contactSentiment.get(contact) || {
      positive: 0,
      negative: 0,
      neutral: 0,
      history: [],
    };

    existing[analysis.sentiment]++;
    existing.history.push({
      sentiment: analysis.sentiment,
      score: analysis.score,
      at: Date.now(),
    });

    if (existing.history.length > 50) {
      existing.history.shift();
    }

    this.contactSentiment.set(contact, existing);
    this.saveState();

    return analysis;
  }

  getContactSentiment(contact) {
    const data = this.contactSentiment.get(contact);
    if (!data) return { overall: 'unknown', confidence: 0 };

    const total = data.positive + data.negative + data.neutral;
    if (total === 0) return { overall: 'unknown', confidence: 0 };

    const scores = {
      positive: data.positive / total,
      negative: data.negative / total,
      neutral: data.neutral / total,
    };

    const dominant = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];

    const recent = data.history.slice(-10);
    const recentPositive = recent.filter(h => h.sentiment === 'positive').length;
    const recentNegative = recent.filter(h => h.sentiment === 'negative').length;

    let trend = 'stable';
    if (recentPositive > recentNegative + 2) trend = 'improving';
    else if (recentNegative > recentPositive + 2) trend = 'declining';

    return {
      overall: dominant[0],
      confidence: Math.round(dominant[1] * 100),
      breakdown: {
        positive: Math.round(scores.positive * 100),
        negative: Math.round(scores.negative * 100),
        neutral: Math.round(scores.neutral * 100),
      },
      trend,
      totalMessages: total,
    };
  }

  getStats() {
    return {
      trackedContacts: this.contactSentiment.size,
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.sentiment-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.contactSentiment = new Map(Object.entries(data.contactSentiment || {}));
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.sentiment-state.json');
    try {
      const obj = Object.fromEntries(this.contactSentiment);
      writeFileSync(stateFile, JSON.stringify({ contactSentiment: obj, savedAt: Date.now() }, null, 2));
    } catch (err) {}
  }
}

export default SentimentDetector;
