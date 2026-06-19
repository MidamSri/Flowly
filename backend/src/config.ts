import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env relative to config.ts file location
// - '../../.env' points to the root workspace directory
// - '../.env' points to the backend package root directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
};

if (!config.geminiApiKey) {
  console.warn('WARNING: GEMINI_API_KEY is not defined in the environment. LLM planning features will fail.');
}
