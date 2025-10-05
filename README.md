# AeroGuard 🌍💨

![AeroGuard App Preview](./images/screenshot.png)

An intelligent air quality monitoring application powered by AI that provides real-time air quality data, personalized health recommendations, and smart activity scheduling.

**Live Demo:** [https://chatbot3-vert.vercel.app/](https://chatbot3-vert.vercel.app/)

## Features ✨

- **Real-time Air Quality Monitoring** - Live AQI data from nearby monitoring stations
- **AI-Powered 12-Hour Forecast** - Smart predictions using Google Gemini AI with caching
- **Personalized Health Advice** - Customized recommendations based on your health conditions
- **Smart Activity Scheduler** - Optimal timing suggestions for indoor/outdoor activities
- **Air Story Mode** - Educational stories about air quality for children with illustrations
- **30-Day Historical Trends** - Track air quality changes over time

## Tech Stack 🛠️

- **Frontend:** React 18 + TypeScript + Vite
- **UI/Charts:** Recharts, Tailwind CSS
- **AI:** Google Gemini 2.5 Flash
- **APIs:** OpenAQ (air quality data), Custom Python backend
- **Deployment:** Vercel

## Usage Guide 📖

### Getting Started

1. **Visit the app:** [https://chatbot3-vert.vercel.app/](https://chatbot3-vert.vercel.app/)

2. **Allow location access** when prompted for accurate local air quality data

3. **View current AQI** - The main dashboard shows your current Air Quality Index

4. **Generate AI Insights** - Click the "Generate AI Insights" button to get:
   - Personalized health advice
   - Smart activity schedule for the next 12 hours
   - An educational air quality story

### Key Features

**12-Hour Forecast Chart** - Visual prediction of AQI changes throughout the day

**Real-time Measurements** - Live pollutant levels (PM2.5, PM10, O₃, NO₂, SO₂, CO)

**Smart Life Planner** - Recommendations for best times to exercise, stay indoors, etc.

**Dark Mode** - Toggle between light and dark themes using the sun/moon icon

## Development 💻
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
