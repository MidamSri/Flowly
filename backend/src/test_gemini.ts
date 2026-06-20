import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';

console.log('Testing Gemini API key:', config.geminiApiKey);
const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

async function run() {
  try {
    console.log('Sending request to gemini-2.5-flash...');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Hello, respond with the single word "Success" if you read this.',
    });
    console.log('Gemini response:', response.text);
  } catch (error: any) {
    console.error('Error generating content:', error);
  }
}

run();
