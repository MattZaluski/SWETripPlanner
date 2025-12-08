# AI Features Documentation

SWETripPlanner includes comprehensive AI-powered features to enhance trip planning. All AI features work in **MOCK mode** without API keys and automatically upgrade when keys are provided.

## Table of Contents
- [Overview](#overview)
- [AI Models](#ai-models)
- [Features](#features)
- [API Endpoints](#api-endpoints)
- [Frontend Integration](#frontend-integration)
- [Configuration](#configuration)

---

## Overview

The AI system provides:
- **Conversational trip planning** via chat interface
- **Smart activity scoring** and recommendations
- **Voice-guided tour narration** during route playback
- **Preference learning** from user behavior
- **Real-time optimization** suggestions

## AI Models

| Priority | Model | Provider | Use Case |
|----------|-------|----------|----------|
| Primary | GPT-4o-mini | OpenAI | All AI features |
| Fallback | Gemini 2.0 Flash | Google | Used when OpenAI unavailable |

Set API keys via environment variables:
```bash
export OPENAI_API_KEY="sk-..."
export GEMINI_API_KEY="..."
```

---

## Features

### 1. Conversational AI Chat Assistant
**Location:** Bottom-right chat bubble on explore page

Chat naturally with the AI about your trip:
- "What are some hidden gems in Boston?"
- "I'm traveling with kids, any suggestions?"
- "What's the best order to visit these places?"

**Capabilities:**
- Context-aware responses based on current itinerary
- Actionable suggestions (add activity, reorder, etc.)
- Travel tips and local recommendations

### 2. AI Activity Summarization
**Trigger:** Hover/click on activity cards

Get AI-generated descriptions for any activity:
- Personalized summary based on your interests
- Key highlights and what makes it special
- "Best for" recommendations (families, couples, solo, etc.)

### 3. Voice-Guided Route Narration
**Trigger:** "Watch Trip" button during route playback

The AI generates a tour guide script:
- Welcoming introduction
- Narration for each route segment
- Travel tips between stops
- Closing remarks

Uses Web Speech API for text-to-speech (works offline).

### 4. Preference Learning
**Automatic:** Tracks add/remove actions

The system learns your preferences over time:
- Categories you frequently add (art, food, nature, etc.)
- Categories you tend to remove
- Builds a preference profile for better recommendations

### 5. AI Alternative Suggestions
**Trigger:** Click "Find Similar" on activity card

Get AI-powered alternatives when an activity doesn't fit:
- Suggests similar activities nearby
- Explains similarity reasoning
- Respects your budget preferences

### 6. Real-Time Route Optimization
**Trigger:** After drag-to-reorder itinerary

AI analyzes your route and suggests improvements:
- Optimal ordering to minimize travel time
- Weather-aware scheduling (outdoor activities when sunny)
- Time-of-day considerations (museums in afternoon heat)

---

## API Endpoints

All endpoints accept JSON and return JSON responses.

### POST `/api/ai/chat`
Conversational chat with the AI assistant.

**Request:**
```json
{
  "message": "What are some hidden gems in Boston?",
  "history": [
    {"role": "user", "content": "I like art"},
    {"role": "assistant", "content": "Great! There are many art museums..."}
  ],
  "context": {
    "location": "Boston, MA",
    "itinerary": [...],
    "interests": ["art", "food"]
  }
}
```

**Response:**
```json
{
  "response": "For hidden gems, try the vintage bookshops on Oak Street...",
  "suggestions": ["Local Museum", "Oak Street Bookshops", "Farmer's Market"],
  "action": null
}
```

### POST `/api/ai/summarize`
Get AI-generated activity description.

**Request:**
```json
{
  "activity": {"name": "Boston Museum of Art", "address": "123 Main St"},
  "user_interests": ["art", "history"]
}
```

**Response:**
```json
{
  "summary": "Boston Museum of Art is a must-visit destination...",
  "highlights": ["Unique atmosphere", "Local favorite", "Great for photos"],
  "best_for": "Art enthusiasts and history buffs"
}
```

### POST `/api/ai/narration`
Generate voice narration script for route playback.

**Request:**
```json
{
  "itinerary": [
    {"name": "Museum", "time": "10:00 AM", "travel_time_min": 15},
    {"name": "Cafe", "time": "12:00 PM", "travel_time_min": 10}
  ],
  "travel_mode": "walk",
  "starting_address": "Downtown Boston"
}
```

**Response:**
```json
{
  "intro": "Welcome to your adventure! Starting from Downtown Boston...",
  "segments": [
    {
      "from": "your starting point",
      "to": "Museum",
      "narration": "Your first stop is the Museum, a 15-minute walk away...",
      "duration_sec": 5
    }
  ],
  "outro": "That concludes your trip! We hope you have an amazing time."
}
```

### GET `/api/ai/preferences`
Retrieve learned user preferences.

**Response:**
```json
{
  "top_interests": ["art", "food", "history"],
  "avoid": ["shopping"],
  "preference_strength": 0.75
}
```

### POST `/api/ai/preferences`
Update preferences based on user action.

**Request:**
```json
{
  "action": "add",
  "activity": {"name": "Art Museum", "categories": ["art", "culture"]}
}
```

**Response:**
```json
{
  "success": true,
  "profile_updated": true
}
```

### POST `/api/ai/recommendations`
Get personalized activity recommendations.

**Request:**
```json
{
  "current_itinerary": [{"name": "Art Museum"}],
  "available_activities": [
    {"name": "History Museum", "categories": ["history"]},
    {"name": "Coffee Shop", "categories": ["food"]}
  ]
}
```

**Response:**
```json
{
  "recommendations": [
    {"name": "History Museum", "categories": ["history"]}
  ],
  "reason": "Based on your interest in cultural activities..."
}
```

### POST `/api/ai/alternatives`
Find similar activities to replace one.

**Request:**
```json
{
  "activity": {"name": "Art Museum", "categories": ["art"]},
  "all_activities": [...],
  "count": 3
}
```

**Response:**
```json
{
  "alternatives": [
    {"name": "Gallery District", "categories": ["art", "culture"]}
  ],
  "similarity_reasons": ["Both focus on visual arts and local culture"]
}
```

### POST `/api/ai/optimize`
Get route optimization suggestions.

**Request:**
```json
{
  "itinerary": [...],
  "starting_coords": {"lat": 42.35, "lng": -71.05},
  "travel_mode": "foot-walking",
  "context": {"weather": {"temp": 72, "condition": "sunny"}}
}
```

**Response:**
```json
{
  "suggestions": [
    {"type": "reorder", "message": "Move Park to midday for best weather", "savings_min": 15}
  ],
  "optimized_order": [0, 2, 1, 3],
  "total_savings_min": 15
}
```

---

## Frontend Integration

### Chat Panel
The chat panel is a floating UI element:
- **Toggle:** Click the chat bubble (bottom-right)
- **Send:** Type message and press Enter or click Send
- **History:** Maintains conversation context within session

### Voice Narration
Integrated with the "Watch Trip" animated playback:
- Automatically generates narration script
- Uses browser's Speech Synthesis API
- Stop button to cancel narration
- Graceful fallback if speech unavailable

### Preference Tracking
Automatically tracks when users:
- Add an activity to itinerary → positive signal
- Remove an activity → negative signal
- Builds profile over multiple sessions (requires login)

### Optimization Suggestions
After drag-reordering the itinerary:
- AI analyzes the new order
- Shows optimization tooltip if improvements found
- One-click apply for suggested reorder

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | No* | OpenAI API key for GPT-4o-mini |
| `GEMINI_API_KEY` | No* | Google Gemini API key (fallback) |
| `MOCK` | No | Set to `true` for mock responses |

*At least one AI key recommended for full functionality.

### MOCK Mode

When `MOCK=true` or no API keys are set:
- All AI endpoints return realistic sample data
- No external API calls made
- Full functionality for testing/development

### Caching

AI responses are cached to reduce API costs:

| Cache | TTL | Purpose |
|-------|-----|---------|
| `summary_cache` | 4 hours | Activity summaries |
| `narration_cache` | 2 hours | Route narrations |
| `alternatives_cache` | 1 hour | Alternative suggestions |
| `preference_cache` | 24 hours | User preference profiles |

---

## Testing

Run all AI endpoint tests:
```bash
# Start server in MOCK mode
cd backend && MOCK=true python3 app.py &

# Test endpoints
curl -X POST http://127.0.0.1:5050/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello!","history":[]}'

curl -X POST http://127.0.0.1:5050/api/ai/summarize \
  -H "Content-Type: application/json" \
  -d '{"activity":{"name":"Test Place"},"user_interests":["art"]}'
```

All endpoints tested and verified working in both MOCK and API-key modes.
