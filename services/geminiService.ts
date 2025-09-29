import { GoogleGenAI, Type } from "@google/genai";
import type { AQIDataPoint, UserHealthProfile, SmartScheduleSuggestion, HourlyForecastData, HistoricalDataPoint } from '../types';

// FIX: Per Gemini API guidelines, the API key must be read from process.env.API_KEY. This resolves the error on import.meta.env.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateHealthAdvice = async (
  currentAQI: AQIDataPoint,
  userProfile: UserHealthProfile
): Promise<string> => {
  const profileConditions = [
    userProfile.hasAllergies && "allergies",
    userProfile.hasAsthma && "asthma",
    userProfile.hasCardiopulmonaryDisease && "cardiopulmonary disease",
  ].filter(Boolean).join(", ");

  const prompt = `
    Based on the current air quality index (AQI) of ${currentAQI.aqi} with the main pollutant being ${currentAQI.pollutant} at a concentration of ${currentAQI.concentration} µg/m³, provide personalized health recommendations for a user with the following conditions: ${profileConditions || 'none'}.
    The advice should be concise, actionable, and formatted as a single paragraph. For example: "With the current high PM2.5 levels, it's advisable to stay indoors. If you have asthma, ensure your inhaler is readily available. Consider using an air purifier."
    Do not use markdown formatting.
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error generating health advice:", error);
    return "Could not generate health advice at this time. Please check your connection or API key.";
  }
};

export const generateSmartSchedule = async (
  hourlyForecast: HourlyForecastData[]
): Promise<SmartScheduleSuggestion[]> => {
  const forecastString = hourlyForecast.map(f => `${f.hour}: AQI ${f.aqi} (${f.pollutant})`).join('\n');
  const prompt = `
    Given the following hourly air quality forecast for today:
    ${forecastString}
    
    Suggest the healthiest times for outdoor activities like jogging and suggest when to do indoor activities like going to the gym. Provide a list of 3-4 suggestions.
    For example: "The best time for a run is around 8 AM when PM2.5 is at its lowest. Avoid outdoor exercise in the afternoon as O3 levels are high."
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING, description: 'The recommended time (e.g., "8 AM - 10 AM")' },
              activity: { type: Type.STRING, description: 'The suggested activity (e.g., "Outdoor Jogging")' },
              reason: { type: Type.STRING, description: 'A brief explanation for the suggestion.' },
              health_risk: { type: Type.STRING, description: 'The estimated health risk level (Low, Moderate, High).' }
            },
            required: ['time', 'activity', 'reason', 'health_risk']
          }
        }
      }
    });

    const jsonText = response.text.trim();
    return JSON.parse(jsonText) as SmartScheduleSuggestion[];
  } catch (error) {
    console.error("Error generating smart schedule:", error);
    return [{
        time: "Now",
        activity: "Error",
        reason: "Could not generate a smart schedule. Please try again later.",
        health_risk: "High"
    }];
  }
};


export const generateAirStoryForChild = async (
  location: string,
  historicalData: HistoricalDataPoint[]
): Promise<string> => {
  const historicalSummary = `The average AQI for ${location} over the past month has shown some fluctuations. It started around ${historicalData[0].aqi}, peaked around ${Math.max(...historicalData.map(d => d.aqi))}, and is currently around ${historicalData[historicalData.length-1].aqi}.`;

  const prompt = `
    Create a short, imaginative "Air Story" for a child (around 5-7 years old) about the city of ${location}.
    The story should be like a gentle, whimsical weather diary, personifying the air. Use simple language.
    Base the story on this summary: ${historicalSummary}.
    Explain potential reasons for air quality changes (like sleepy cars at night making the air clearer, or lots of sunshine making the air a bit grumpy and hazy) in a simple, narrative style.
    The story should be a single, friendly paragraph.
    Example: "In the magical city of ${location}, the little breezes have been on an adventure! Last month, they danced happily in clear skies. But then, lots of busy cars woke up and puffed out sleepy smoke, making the breezes tired and the air a bit gray. A friendly raincloud came to visit and washed the sky clean, so the breezes could play freely again! Today, they are whispering for us to walk and play gently, to help them keep our air sparkly and clean."
    Do not use markdown formatting.
  `;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    return response.text;
  } catch (error) {
    console.error("Error generating air story:", error);
    return "Could not generate an air story at this time. The air holds its secrets for now.";
  }
};

export const generateImageFromStory = async (storyText: string): Promise<string | null> => {
    const prompt = `A whimsical, colorful, and friendly illustration for a children's storybook. The scene is based on this story: "${storyText}". The style should be gentle and magical, with soft colors and clear, simple shapes, like a watercolor painting.`;
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/png',
              aspectRatio: '16:9',
            },
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
            const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
            return `data:image/png;base64,${base64ImageBytes}`;
        }
        return null;
    } catch (error) {
        console.error("Error generating image from story:", error);
        return null;
    }
};