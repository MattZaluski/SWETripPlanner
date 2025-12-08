# SWETripPlanner

AI-powered trip planning application with interactive maps, smart itinerary building, and voice-guided tours.

## Features

- 🗺️ **Interactive Map** - Visualize your trip with real-time route rendering
- 🤖 **AI Trip Assistant** - Chat with AI for personalized recommendations
- 📍 **Smart Planning** - AI-scored activities based on your interests
- 🎯 **Drag & Drop Itinerary** - Easily reorder your trip stops
- 🎬 **Animated Playback** - Watch your trip unfold with voice narration
- 🧠 **Preference Learning** - System learns from your choices over time
- 🔄 **Route Optimization** - AI suggests better ordering to save time

## Documentation

- [AI Features Guide](./AI_FEATURES.md) - Comprehensive AI functionality docs
- [Map Features Guide](./MAP_FEATURES.md) - Interactive map documentation
- [Feature Summary](./FEATURE_SUMMARY.md) - Complete feature overview

---

## Quick Start

### 1) Clone repo & enter folder
```bash
git clone https://github.com/MattZaluski/SWETripPlanner.git
cd SWETripPlanner
```

2) Create a branch (optional but recommended)
```bash
git checkout -b feature/setup
```

3) Create virtual environment

**Windows PowerShell**
```bash
python -m venv venv
.\venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, run once:
```bash
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\venv\Scripts\Activate.ps1
```

**Windows cmd.exe**
```bash
python -m venv venv
venv\Scripts\activate
```

**mac / Linux (bash)**
```bash
python3 -m venv venv
source venv/bin/activate
```

4) Install dependencies
```bash
pip install --upgrade pip
pip install -r backend/requirements.txt
```

5) Copy env example and enable mock

**mac / linux**
```bash
cp backend/.env.example backend/.env
```

**Windows PowerShell**
```bash
Copy-Item backend\.env.example backend\.env
```

Open `backend/.env` and set:
```bash
MOCK=true
```

6) Select venv interpreter in VS Code  
Press `Ctrl/Cmd + Shift + P → Python: Select Interpreter →` choose the venv interpreter from this repo.

7) Start the dev server
```bash
cd backend && python app.py
```

The app runs on port **5050** by default.

8) Open the app  
In browser: `http://127.0.0.1:5050`

---

## Environment Variables

Create a `.env` file in the `backend/` folder:

```bash
# Required for full functionality (optional - MOCK mode works without)
OPENAI_API_KEY=sk-...          # AI features (GPT-4o-mini)
GEMINI_API_KEY=...             # Fallback AI (Gemini 2.0 Flash)
GEOAPIFY_KEY=...               # Maps, geocoding, routing
WEATHER_API_KEY=...            # Weather data
MONGODB_URI=mongodb://...      # User accounts & saved trips

# Development
MOCK=true                      # Enable mock mode (no API keys needed)
FLASK_DEBUG=true               # Enable debug mode
```

### MOCK Mode

Set `MOCK=true` to run without any API keys:
- All features work with realistic sample data
- Perfect for development and testing
- No external API calls made

---

## API Keys

| Service | Purpose | Get Key |
|---------|---------|---------|
| OpenAI | AI chat, summaries, optimization | [platform.openai.com](https://platform.openai.com) |
| Google Gemini | Fallback AI | [ai.google.dev](https://ai.google.dev) |
| Geoapify | Maps, geocoding, routing | [geoapify.com](https://geoapify.com) |
| OpenWeatherMap | Weather data | [openweathermap.org](https://openweathermap.org) |
| MongoDB Atlas | Database | [mongodb.com/atlas](https://mongodb.com/atlas) |

---

## Project Structure

```
SWETripPlanner/
├── backend/
│   ├── app.py          # Flask routes & API endpoints
│   ├── services.py     # Business logic & AI functions
│   └── requirements.txt
├── static/
│   ├── explore.html    # Main trip planning page
│   ├── explore.js      # Frontend logic
│   ├── explore.css     # Styles
│   └── images/
├── AI_FEATURES.md      # AI documentation
├── MAP_FEATURES.md     # Map documentation
└── README.md
```

---

## License

MIT