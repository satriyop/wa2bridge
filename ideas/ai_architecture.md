# WhatsApp2App AI Architecture

## Overview

WhatsApp2App is a natural language interface that allows users to query connected Laravel applications (Enterkom, Enter365) via WhatsApp. The AI layer transforms Indonesian natural language messages into database queries and formats results into human-readable responses.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WhatsApp Message                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MESSAGE PROCESSOR                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐     │
│  │ Rate Limiter│→ │Input Sanitizer│→│Special Cmds │→ │ User Commands │     │
│  └─────────────┘  └──────────────┘  └─────────────┘  └───────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRE-PROCESSING LAYER                               │
│  ┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐              │
│  │SynonymLearner │→ │QueryAutoCorrector│→ │SmartContextManager│             │
│  └───────────────┘  └─────────────────┘  └──────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SEMANTIC CACHE                                  │
│                    (Skip parsing if similar query cached)                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          │ Cache Miss            │ Cache Hit
                          ▼                       ▼
┌─────────────────────────────────────┐   ┌─────────────────────┐
│          FALLBACK CHAIN             │   │   Use Cached Result │
│  ┌────────────────────────────┐     │   └─────────────────────┘
│  │ 1. RuleBasedMatcher (fast) │     │
│  ├────────────────────────────┤     │
│  │ 2. Primary LLM Parser      │     │
│  │    (tool_calling/json)     │     │
│  ├────────────────────────────┤     │
│  │ 3. Backup LLM Parser       │     │
│  │    (if low confidence)     │     │
│  ├────────────────────────────┤     │
│  │ 4. Entity Extractor        │     │
│  │    (merge entities)        │     │
│  └────────────────────────────┘     │
└─────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INTENT PROCESSING                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐        │
│  │ConversationMemory│→│ConfidenceCalibrator│→│ SmartDefaults      │        │
│  │(apply preferences)│ │(calibrate score)  │ │(infer missing vals)│        │
│  └─────────────────┘  └──────────────────┘  └─────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUERY EXECUTION                                      │
│  ┌─────────────┐  ┌───────────────┐  ┌────────────────┐                    │
│  │QueryBuilder │→ │ScopeEnforcer  │→ │QueryExecutor   │                    │
│  │(intent→SQL) │  │(user data only)│  │(run with timeout)│                 │
│  └─────────────┘  └───────────────┘  └────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        POST-PROCESSING LAYER                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │InsightGenerator│  │TrendAnalyzer │  │AnomalyDetector│  │ResultSummarizer│
│  └────────────────┘  └──────────────┘  └───────────────┘  └─────────────┘  │
│  ┌──────────────────┐  ┌─────────────────────┐                              │
│  │DataFreshnessIndicator│ │QuerySuggester     │                              │
│  └──────────────────┘  └─────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LEARNING LAYER                                      │
│  ┌─────────────┐  ┌───────────────┐  ┌────────────────┐                    │
│  │QueryLearner │  │CrossUserLearner│  │SynonymLearner │                    │
│  └─────────────┘  └───────────────┘  └────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RESPONSE                                            │
│                   (Formatted WhatsApp message)                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Message Processor

**Location:** `app/Services/MessageProcessor.php`

The central orchestrator that coordinates all AI services. It:
- Validates user and app access
- Checks rate limits
- Routes to appropriate handlers
- Manages the processing pipeline

**Key Dependencies:** 28 injected services covering all AI functionality

---

## Intent Parsing Pipeline

### The FallbackChain Strategy

**Location:** `app/Services/AI/FallbackChain.php`

Implements a confidence-based fallback system:

```
Message ──► RuleBasedMatcher ──► Primary LLM ──► Backup LLM ──► Best Result
               (fast, 0 cost)    (tool_calling)   (json mode)
                    │                  │               │
                    ▼                  ▼               ▼
            confidence ≥0.7     confidence ≥0.7   pick highest
              return early       return early      confidence
```

**Confidence Threshold:** 0.7 (configurable)

### Parser Strategies

| Strategy | Provider | Method | Use Case |
|----------|----------|--------|----------|
| `tool_calling` | Claude | Native tool_use | **Primary** - Most robust |
| `json` | Claude | JSON extraction | Backup for tool_calling |
| `openai` | OpenAI | Function calling | Alternative provider |
| `ollama` | Ollama | JSON extraction | Offline, no API costs |

**Factory Location:** `app/Services/IntentParser/IntentParserFactory.php`

### RuleBasedMatcher

**Location:** `app/Services/AI/RuleBasedMatcher.php`

Fast pattern matching without LLM calls. Handles obvious patterns:

| Pattern | Intent | Example |
|---------|--------|---------|
| `berapa jumlah X` | count_data | "berapa jumlah user aktif?" |
| `tampilkan daftar X` | list_data | "tampilkan daftar invoice" |
| `total nilai X` | aggregate_data | "total nilai tagihan pending" |
| `detail X id Y` | detail_data | "detail invoice id 123" |

**Skips:** Contextual queries (yang tadi, sebelumnya, gimana, kenapa)

### EntityExtractor

**Location:** `app/Services/AI/EntityExtractor.php`

Extracts structured data from messages independently of intent:
- Date ranges ("hari ini", "bulan ini", "minggu lalu")
- Limits ("5 teratas", "10 terakhir")
- IDs (numeric patterns)
- Status ("aktif", "pending", "lunas")
- Sort directions ("terbaru", "terlama")

**Merged into:** Final IntentResult after parsing

---

## Context Management

### SmartContextManager

**Location:** `app/Services/AI/SmartContextManager.php`

Handles conversation memory and reference resolution:

**Reference Patterns:**
| Pattern | Type | Resolution |
|---------|------|------------|
| "yang tadi" | Previous query | Inject last query context |
| "yang pertama" | Row reference | Get row[0] from last result |
| "yang kedua" | Row reference | Get row[1] from last result |
| "lebih detail" | Detail request | Suggest detail_data intent |

**Context Analysis Output:**
- `enrichedMessage` - Message with context hints for LLM
- `resolvedContext` - Resolved IDs, tables, filters
- `isFollowUp` - Boolean indicating follow-up question
- `suggestedIntent` - Hint for intent if contextual

### ConversationMemory

**Location:** `app/Services/AI/ConversationMemory.php`

Stores user preferences and applies them to queries:
- Default date ranges ("always hari ini")
- Preferred tables
- Custom filters

**Command:** "default hari ini" → sets time filter preference

---

## Vocabulary & Language Processing

### AppContextProvider

**Location:** `app/Services/IntentParser/AppContextProvider.php`

Maps Indonesian words to database tables per application:

```
enterkom:
  - pengguna → users
  - absensi → attendances
  - desa → villages
  - rapat → meetings

enter365:
  - invoice → invoices
  - tagihan → bills
  - produk → products
```

**Also provides:** Intent patterns, few-shot examples, primary tables

### QueryAutoCorrector

**Location:** `app/Services/AI/QueryAutoCorrector.php`

Fixes typos using Levenshtein distance:
- `invois` → `invoice`
- `berpa` → `berapa`
- `pelangan` → `pelanggan`

**Max Distance:** 2 characters
**Min Word Length:** 4 characters

### SynonymLearner

**Location:** `app/Services/AI/SynonymLearner.php`

User-defined synonyms:
- Command: "sinonim barang = produk"
- Applied before parsing

---

## Caching Layer

### SemanticCache

**Location:** `app/Services/AI/SemanticCache.php`

Caches successful query results for similar future queries:

```
Query ──► Normalize ──► Check Cache ──► Hit? ──► Return cached
              │                           │
              ▼                           ▼
        - Remove stopwords          Cache Miss ──► LLM Parse
        - Apply synonyms
        - Fuzzy match
```

**Cache Key:** Normalized query + app_id
**TTL:** Configurable (default 1 hour)
**Skips:** Contextual queries (depend on conversation state)

---

## Query Execution

### QueryBuilder

**Location:** `app/Services/Query/QueryBuilder.php`

Converts IntentResult into Laravel Query Builder:
- Maps intent to query type (SELECT, COUNT, SUM, etc.)
- Applies filters from entities
- Enforces scope (user can only see their data)
- Respects blacklisted tables/columns

### QueryExecutor

**Location:** `app/Services/Query/QueryExecutor.php`

Executes queries with safety measures:
- Timeout enforcement (25s default via SET MAX_EXECUTION_TIME)
- Row limit from tier configuration
- Error sanitization (removes sensitive DB info)

---

## Post-Processing Services

### InsightGenerator

**Location:** `app/Services/AI/InsightGenerator.php`

Generates contextual insights from query results:
- Count comparisons ("15 lebih banyak dari kemarin")
- Aggregate analysis ("rata-rata Rp 500.000")
- Distribution breakdown ("70% status aktif")

### TrendAnalyzer

**Location:** `app/Services/AI/TrendAnalyzer.php`

Detects trends in time-series data:
- Growth/decline percentage
- Peak detection
- Seasonal patterns

### AnomalyDetector

**Location:** `app/Services/AI/AnomalyDetector.php`

Flags unusual patterns:
- Values outside normal range
- Sudden spikes/drops
- Missing expected data

### ResultSummarizer

**Location:** `app/Services/AI/ResultSummarizer.php`

Creates summaries for large result sets:
- Numeric aggregations
- Status distributions
- Top/bottom items

### DataFreshnessIndicator

**Location:** `app/Services/AI/DataFreshnessIndicator.php`

Shows data freshness:
- "Data terkini (5 menit lalu)"
- "Data agak lama (2 jam lalu)"
- "Data mungkin tidak akurat (1 hari lalu)"

---

## Learning System

### QueryLearner

**Location:** `app/Services/AI/QueryLearner.php`

Learns from successful/failed queries:
- Stores successful intent mappings in `learned_vocabulary` table
- Increases confidence on repeated success
- Records failures for analysis

### CrossUserLearner

**Location:** `app/Services/AI/CrossUserLearner.php`

Shares learnings across users:
- Popular query patterns
- Successful interpretations
- Vocabulary discoveries

---

## User Interaction Features

### QuerySuggester

**Location:** `app/Services/AI/QuerySuggester.php`

Suggests follow-up queries:
- Based on current intent (count → list, list → detail)
- Popular queries for the table
- Related data exploration

### ProactiveSuggester

**Location:** `app/Services/AI/ProactiveSuggester.php`

Triggered by "?" or "saran":
- Suggests queries based on user history
- Highlights unused features
- Time-relevant suggestions

### QueryShortcutManager

**Location:** `app/Services/AI/QueryShortcutManager.php`

User-defined shortcuts:
- `!daily` → "tampilkan absensi hari ini"
- `!sales` → "total nilai invoice bulan ini"

**Commands:**
- `shortcut add !name = query`
- `shortcut list`
- `shortcut delete !name`

### QueryTemplateManager

**Location:** `app/Services/AI/QueryTemplateManager.php`

Admin-defined templates with variables:
- `@laporan_harian {tanggal}` → parameterized query

### FeedbackHandler

**Location:** `app/Services/AI/FeedbackHandler.php`

Processes user feedback:
- "salah" / "benar" → records feedback
- Improves future parsing
- Triggers reprocessing on negative feedback

---

## Multi-Query Support

### BatchQueryProcessor

**Location:** `app/Services/AI/BatchQueryProcessor.php`

Handles numbered lists:
```
1. berapa jumlah user?
2. tampilkan invoice pending
3. total nilai tagihan
```

### MultiIntentDetector

**Location:** `app/Services/AI/MultiIntentDetector.php`

Splits compound queries:
```
"berapa jumlah user dan tampilkan invoice terbaru"
       ↓
Query 1: "berapa jumlah user"
Query 2: "tampilkan invoice terbaru"
```

**Splits on:** "dan", "juga", "serta", "plus"

---

## Error Handling

### ErrorRecovery

**Location:** `app/Services/AI/ErrorRecovery.php`

Provides helpful error responses:
- Suggests similar valid queries
- Explains what went wrong
- Offers alternatives based on available tables

---

## Confidence System

### ConfidenceCalibrator

**Location:** `app/Services/AI/ConfidenceCalibrator.php`

Adjusts confidence scores based on:
- Parser agreement (multiple parsers agree → higher)
- Historical accuracy for similar queries
- Entity extraction quality

---

## Monitoring

### AIHealthMonitor

**Location:** `app/Services/AI/AIHealthMonitor.php`

Tracks health of all 28 AI services:
- Error rates per service
- Response times
- Usage statistics
- Critical alerts

**Dashboard:** `/admin/analytics/health`

---

## Intent Types

| Intent | Description | Example |
|--------|-------------|---------|
| `count_data` | Count records | "berapa jumlah invoice?" |
| `list_data` | List records | "tampilkan daftar user" |
| `aggregate_data` | Sum/avg/min/max | "total nilai tagihan" |
| `detail_data` | Single record detail | "detail invoice 123" |

---

## Data Flow Summary

1. **Input:** WhatsApp message arrives
2. **Validation:** User auth, rate limits, input sanitization
3. **Pre-processing:** Synonym application, typo correction, context analysis
4. **Caching:** Check semantic cache for similar queries
5. **Parsing:** FallbackChain (Rule → Primary LLM → Backup LLM)
6. **Entity Merge:** Combine extracted entities with parsed intent
7. **Enhancement:** Apply user preferences, smart defaults
8. **Execution:** Build and run query with scope enforcement
9. **Post-processing:** Generate insights, trends, anomalies, summaries
10. **Learning:** Record success/failure for future improvement
11. **Response:** Format and send WhatsApp reply

---

## Configuration

### Key Config Files

- `config/llm.php` - LLM provider settings, intent parser selection
- `config/wa2app.php` - App settings, rate limits, timeouts

### Environment Variables

```
LLM_PROVIDER=claude
LLM_INTENT_PARSER=tool_calling
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

---

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `query_logs` | All query attempts with metadata |
| `query_cache` | Semantic cache entries |
| `learned_vocabulary` | Machine-learned term mappings |
| `user_preferences` | User-specific preferences |
| `user_synonyms` | User-defined synonyms |
| `query_shortcuts` | User-defined shortcuts |

---

## Performance Optimizations

1. **RuleBasedMatcher First:** 0-cost pattern matching before LLM
2. **SemanticCache:** Skip parsing for similar queries
3. **Entity Extraction Parallel:** Always runs, merged with any parser
4. **Confidence-Based Fallback:** Only use backup if needed
5. **Query Timeout:** 25s limit prevents runaway queries
6. **Result Caching:** Cached responses for repeated queries

---

## Extension Points

### Adding New Intent Types

1. Add pattern to `RuleBasedMatcher::$patterns`
2. Add handling in `QueryBuilder::buildFromIntent()`
3. Update `ResponseFormatter` for new output format

### Adding New LLM Provider

1. Create class implementing `IntentParserInterface`
2. Extend `AbstractIntentParser` for common functionality
3. Register in `IntentParserFactory::$parsers`

### Adding New Vocabulary

1. Update `AppContextProvider::$vocabularyMappings`
2. Add to `QueryAutoCorrector` known terms if needed
3. Optionally add few-shot examples

---

## Directory Structure

```
app/
├── Contracts/
│   ├── IntentParserInterface.php
│   └── LLMServiceInterface.php
├── DTOs/
│   ├── IntentResult.php
│   └── QueryResult.php
├── Services/
│   ├── AI/
│   │   ├── AIHealthMonitor.php
│   │   ├── AnomalyDetector.php
│   │   ├── BatchQueryProcessor.php
│   │   ├── ComparativeAnalyzer.php
│   │   ├── ConfidenceCalibrator.php
│   │   ├── ConversationMemory.php
│   │   ├── CrossUserLearner.php
│   │   ├── DataFreshnessIndicator.php
│   │   ├── EntityExtractor.php
│   │   ├── ErrorRecovery.php
│   │   ├── FallbackChain.php
│   │   ├── FeedbackHandler.php
│   │   ├── InsightGenerator.php
│   │   ├── MultiIntentDetector.php
│   │   ├── ProactiveSuggester.php
│   │   ├── QueryAutoCorrector.php
│   │   ├── QueryComplexityScorer.php
│   │   ├── QueryExplainer.php
│   │   ├── QueryLearner.php
│   │   ├── QueryShortcutManager.php
│   │   ├── QuerySuggester.php
│   │   ├── QueryTemplateManager.php
│   │   ├── ResultSummarizer.php
│   │   ├── RuleBasedMatcher.php
│   │   ├── SemanticCache.php
│   │   ├── SmartContextManager.php
│   │   ├── SmartDefaults.php
│   │   ├── SynonymLearner.php
│   │   └── TrendAnalyzer.php
│   ├── IntentParser/
│   │   ├── AbstractIntentParser.php
│   │   ├── AppContextProvider.php
│   │   ├── IntentParserFactory.php
│   │   ├── JsonIntentParser.php
│   │   ├── OllamaIntentParser.php
│   │   ├── OpenAIIntentParser.php
│   │   └── ToolCallingIntentParser.php
│   ├── Query/
│   │   ├── QueryBuilder.php
│   │   └── QueryExecutor.php
│   ├── MessageProcessor.php
│   ├── ResponseFormatter.php
│   ├── SessionManager.php
│   └── RateLimiter.php
└── ...
```

---

## Service Count Summary

| Category | Count | Examples |
|----------|-------|----------|
| Parsing | 6 | FallbackChain, RuleBased, EntityExtractor |
| Context | 2 | SmartContextManager, ConversationMemory |
| Caching | 1 | SemanticCache |
| Learning | 3 | QueryLearner, CrossUser, Synonym |
| Analytics | 4 | Insight, Trend, Anomaly, Summarizer |
| User Features | 4 | Suggester, Shortcuts, Templates, Feedback |
| Quality | 3 | Confidence, Complexity, Freshness |
| Error Handling | 1 | ErrorRecovery |
| Monitoring | 1 | AIHealthMonitor |
| **Total** | **28** | |
