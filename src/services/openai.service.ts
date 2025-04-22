import { Configuration, OpenAIApi } from 'openai';
import { config } from '../utils/config';
import logger from '../utils/logger';
import { OpenAIError } from '../types/errors';

const openai = new OpenAIApi(
  new Configuration({
    apiKey: config.openai.apiKey,
  }),
);

export const generateEmbedding = async (text: string): Promise<number[]> => {
  try {
    const response = await openai.createEmbedding({
      model: 'text-embedding-ada-002',
      input: text,
    });

    return response.data.data[0].embedding;
  } catch (error: unknown) {
    const apiError = error as OpenAIError;
    logger.error(
      {
        error: apiError,
        errorMessage: apiError?.message || 'Unknown OpenAI API error',
        errorStack: apiError?.stack,
        errorResponse: apiError?.response?.data,
      },
      'OpenAI API error generating embedding',
    );
    throw error;
  }
};
