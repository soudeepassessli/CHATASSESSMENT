import { handleAssessmentGeneration, handleAssessmentModification } from '../services/assessmentService.js';
import { logger } from '../utils/logger.js';
import { extractAssessmentParams } from '../utils/paramExtractor.js';

// Session store to maintain conversation state
const sessionStore = new Map();



export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);
    
    // Initialize session data for new connection
    sessionStore.set(socket.id, {
      assessmentParams: {},
      conversationHistory: []
    });

    socket.on('generate_assessment', async (message) => {
      try {
        // Get current session data
        const sessionData = sessionStore.get(socket.id) || {
          assessmentParams: {},
          conversationHistory: []
        };
        const messageContent = typeof message === 'string' ? message : 
        (message.prompt || JSON.stringify(message));
        
        // Add message to conversation history
        sessionData.conversationHistory.push({ role: 'user', content: messageContent });
        
        // Extract parameters using Gemini
        const extractedParams = await extractAssessmentParams(messageContent);
        
        // Merge with existing parameters (new values override old ones)
        const mergedParams = {
          topics: [...new Set([...(sessionData.assessmentParams.topics || []), ...extractedParams.topics])],
          questionTypes: [...new Set([...(sessionData.assessmentParams.questionTypes || []), ...extractedParams.questionTypes])],
          totalMarks: extractedParams.totalMarks || sessionData.assessmentParams.totalMarks,
          duration: extractedParams.duration || sessionData.assessmentParams.duration,
          numberOfQuestions: extractedParams.numberOfQuestions || sessionData.assessmentParams.numberOfQuestions
        };
        
        // Update session with merged parameters
        sessionData.assessmentParams = mergedParams;
        sessionStore.set(socket.id, sessionData);

        const updatedMissingParams = [];
      if (!mergedParams.topics?.length) updatedMissingParams.push('topics');
      if (!mergedParams.questionTypes?.length) updatedMissingParams.push('question types');
      if (mergedParams.totalMarks === null) updatedMissingParams.push('total marks');
      if (mergedParams.duration === null) updatedMissingParams.push('duration');
      if (mergedParams.numberOfQuestions === null) updatedMissingParams.push('number of questions');
        
      if (updatedMissingParams.length > 0) {
          // Still missing parameters, ask for them
          const missingParamsMessage = generateMissingParamsMessage(extractedParams.missingParams, mergedParams);
          socket.emit('request_params', {
            message: missingParamsMessage,
            missingParams: extractedParams.missingParams,
            currentParams: mergedParams
          });
          
          // Add system response to conversation history
          sessionData.conversationHistory.push({ 
            role: 'system', 
            content: missingParamsMessage
          });
          sessionStore.set(socket.id, sessionData);
        } else {
          // We have all parameters, generate assessment
          logger.info(`Generating assessment with params: ${JSON.stringify(mergedParams)}`);
          
          const assessment = await handleAssessmentGeneration(mergedParams);
          socket.emit('assessment_generated', assessment);
          
          // Add successful generation to history
          sessionData.conversationHistory.push({ 
            role: 'system', 
            content: 'Assessment generated successfully' 
          });
          
          // Keep the session data for potential modifications
          sessionStore.set(socket.id, sessionData);
        }
      } catch (error) {
        logger.error('Error generating assessment:', error);
        socket.emit('error', {
          message: 'Failed to generate assessment',
          error: error.message
        });
      }
    });

    socket.on('modify_assessment', async (data) => {
      try {
        const { assessmentId, originalAssessment, modifications } = data;
        if (!originalAssessment) {
          throw new Error('Original assessment is required for modification');
        }
        

        const updatedAssessment = await handleAssessmentModification(
          assessmentId,
          originalAssessment,
          modifications
        );
        socket.emit('assessment_modified', updatedAssessment);
      } catch (error) {
        logger.error('Error modifying assessment:', error);
        socket.emit('error', {
          message: 'Failed to modify assessment',
          error: error.message
        });
      }
    });

    socket.on('reset_conversation', () => {
      sessionStore.set(socket.id, {
        assessmentParams: {},
        conversationHistory: []
      });
      socket.emit('conversation_reset', { message: 'Conversation has been reset' });
      logger.info(`Conversation reset for client: ${socket.id}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
      sessionStore.delete(socket.id);
    });
  });
}

function generateMissingParamsMessage(missingParams, currentParams) {
  let message = 'Please provide the following details:\n';
  
  missingParams.forEach(param => {
    switch(param) {
      case 'topics':
        message += '- What topics should be covered in the assessment?\n';
        break;
      case 'question types':
        message += '- What types of questions would you like (e.g., MCQ, short answer)?\n';
        break;
      case 'total marks':
        message += '- What should be the total marks for the assessment?\n';
        break;
      case 'duration':
        message += '- How long should the assessment be (in minutes)?\n';
        break;
      case 'number of questions':
        message += '- How many questions should be included?\n';
        break;
    }
  });

  if (Object.keys(currentParams).length > 0) {
    message += '\nCurrently specified parameters:\n';
    if (currentParams.topics?.length) message += `- Topics: ${currentParams.topics.join(', ')}\n`;
    if (currentParams.questionTypes?.length) message += `- Question types: ${currentParams.questionTypes.join(', ')}\n`;
    if (currentParams.totalMarks) message += `- Total marks: ${currentParams.totalMarks}\n`;
    if (currentParams.duration) message += `- Duration: ${currentParams.duration} minutes\n`;
    if (currentParams.numberOfQuestions) message += `- Number of questions: ${currentParams.numberOfQuestions}\n`;
  }

  return message;
}