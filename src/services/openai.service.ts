import { Configuration, OpenAIApi } from 'openai';
import { config } from '../utils/config';
import logger from '../utils/logger';

const openai = new OpenAIApi(
  new Configuration({
    apiKey: config.openai.apiKey,
  })
);

export const generateEmbedding = async (text: string): Promise<number[]> => {
  try {
    const response = await openai.createEmbedding({
      model: 'text-embedding-ada-002',
      input: text,
    });
    
    return response.data.data[0].embedding;
  } catch (error: any) {
    logger.error({ 
      error,
      errorMessage: error?.message || 'Unknown OpenAI API error',
      errorStack: error?.stack,
      errorResponse: error?.response?.data
    }, 'OpenAI API error generating embedding');
    throw error;
  }
}; 