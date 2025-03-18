import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger.js';

console.log('Initializing Google Generative AI with API key');
const genAI = new GoogleGenerativeAI("AIzaSyA04wWpwIV8WOUJVCDTGPtDT1Th9a41ipI");

const SYSTEM_PROMPT = `You are an intelligent assessment generator. Your task is to create structured assessments based on user requirements.

CRITICAL: Your response must ALWAYS be a valid JSON object with the following structure:
{
  "questions": [
    {
      "id": string,
      "type": string,
      "text": string,
      "marks": number,
      "options": string[] (for multiple choice),
      "correctAnswer": string
    } 
  ],
  "totalMarks": number,
  "duration": number,
  "topics": string[]
}`;

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
export async function handleAssessmentGeneration(params) {
  try {
    console.log('Starting assessment generation with params:', params);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    console.log('Initialized Gemini model');

    const prompt = generatePrompt(params);
    console.log('Generated prompt for assessment');

    // Fix: Use the correct format for Gemini API
    const result = await model.generateContent({
      contents: [
        {
          parts: [
            { text: SYSTEM_PROMPT },
            { text: prompt }
          ]
        }
      ]
    });
    
    console.log('Received response from Gemini API');
    const response = await result.response;

    const text = response.text();
    console.log('Extracted text from response');

    const cleanedText = extractJsonFromText(text);
    console.log('Cleaned text for parsing:', cleanedText);
    
    const parsedResponse = JSON.parse(cleanedText);
    console.log('Successfully parsed response to JSON');

    return parsedResponse;
  } catch (error) {
    console.error('Error in assessment generation:', error);
    logger.error('Error in assessment generation:', { error: error.message, stack: error.stack });
    throw new Error('Failed to generate assessment');
  }
}


export async function handleAssessmentModification(assessmentId, modifications) {
  console.log('Starting assessment modification', { assessmentId, modifications });
  logger.info('Starting assessment modification', { assessmentId, modifications });

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    console.log('Initialized Gemini model for modification');

    const prompt = generateModificationPrompt(assessmentId, modifications);
    console.log('Generated modification prompt');

    const result = await model.generateContent([SYSTEM_PROMPT, prompt]);
    console.log('Received response from Gemini API for modification');

    const response = await result.response;
    const text = response.text().trim(); // Remove unnecessary whitespace

    console.log('Raw response text:', text);
    logger.debug('Raw response text:', text);

    // 🔴 Remove possible Markdown code blocks (` ```json ` and ` ``` `)
    const cleanedText = text.replace(/```json|```/g, '').trim();

    console.log('Cleaned response:', cleanedText);
    logger.debug('Cleaned response:', cleanedText);

    const parsedResponse = JSON.parse(cleanedText);
    console.log('Successfully parsed modification response');
    logger.info('Successfully modified assessment', { assessmentId });

    return parsedResponse;
  } catch (error) {
    console.error('Error in assessment modification:', error);
    logger.error('Error in assessment modification:', { assessmentId, error: error.message, stack: error.stack });
    throw new Error('Failed to modify assessment');
  }
}


function generatePrompt(params) {
  console.log('Generating prompt with parameters:', params);
  logger.debug('Generating prompt with params:', params);
  return `Generate an assessment with the following parameters:
- Topics: ${params.topics.join(', ')}
- Question types: ${params.questionTypes.join(', ')}
- Total marks: ${params.totalMarks}
- Duration: ${params.duration} minutes
- Number of questions: ${params.numberOfQuestions}

Please generate questions that are appropriate for the specified topics and format the response as a JSON object.`;
}

function generateModificationPrompt(assessmentId, modifications) {
  console.log('Generating modification prompt for assessment:', assessmentId);
  logger.debug('Generating modification prompt', { assessmentId, modifications });
  return `Modify the assessment with the following changes:
${JSON.stringify(modifications, null, 2)}

Please maintain the same structure and format the response as a JSON object.`;
}