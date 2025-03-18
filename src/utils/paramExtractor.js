import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { logger } from './logger.js';

const genAI = new GoogleGenerativeAI("AIzaSyA04wWpwIV8WOUJVCDTGPtDT1Th9a41ipI");

const PARAM_EXTRACTION_PROMPT = `
Extract assessment parameters from the user message.
Return ONLY a JSON object with the following structure:
{
  "topics": string[],
  "questionTypes": string[],
  "totalMarks": number,
  "duration": number,
  "numberOfQuestions": number,
  "missingParams": string[]
}

The "missingParams" array should include any of these parameters that are not specified: 
["topics", "question types", "total marks", "duration", "number of questions"]

If a parameter is not mentioned, set its value to null or an empty array as appropriate.
`;


const ParamsSchema = z.object({
  topics: z.array(z.string()),
  questionTypes: z.array(z.string()),
  totalMarks: z.number().nullable(),
  duration: z.number().nullable(),
  numberOfQuestions: z.number().nullable()
});

function extractJsonFromText(text) {
  // Remove markdown code block formatting if present
  let cleanedText = text.replace(/```(?:json)?\n?/g, '').trim();
  
  // If the text starts with a { and ends with a }, assume it's JSON
  if (cleanedText.startsWith('{') && cleanedText.endsWith('}')) {
    return cleanedText;
  }
  
  // Try to find JSON object in the text
  const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : text;
}

export async function extractAssessmentParams(message) {
  try {
    if (!message || typeof message !== 'string') {
      logger.error(`Invalid message format: ${typeof message}`);
      throw new Error('Message must be a string');
    }
    logger.info(`Extracting parameters from message: ${message}`);

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const result = await model.generateContent({
      contents: [{
        parts: [{ text: PARAM_EXTRACTION_PROMPT }, { text: message }]
      }]
    });

    const response = result.response;
    const text = response.text();
    logger.info(`Raw parameter extraction response: ${text}`);

    const jsonText = extractJsonFromText(text);
    
    // Parse and validate the response
    const extractedParams = JSON.parse(jsonText);
    const validatedParams = ParamsSchema.parse(extractedParams);

    // Identify missing parameters
    const missingParams = [];
    if (!validatedParams.topics.length) missingParams.push('topics');
    if (!validatedParams.questionTypes.length) missingParams.push('question types');
    if (validatedParams.totalMarks === null) missingParams.push('total marks');
    if (validatedParams.duration === null) missingParams.push('duration');
    if (validatedParams.numberOfQuestions === null) missingParams.push('number of questions');

    return {
      ...validatedParams,
      missingParams
    };
  } catch (error) {
    logger.error('Error extracting parameters:', error);
    // Return empty parameters with all fields marked as missing
    return {
      topics: [],
      questionTypes: [],
      totalMarks: null,
      duration: null,
      numberOfQuestions: null,
      missingParams: ['topics', 'question types', 'total marks', 'duration', 'number of questions']
    };
  }
}
