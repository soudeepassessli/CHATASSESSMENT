import { io } from 'socket.io-client';
import { logger } from './utils/logger.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const socket = io('http://localhost:3000');

// Connection event handlers
socket.on('connect', () => {
  logger.info('Connected to server');
  console.log('Connected to server');
  
  // Test Case 1: Complete assessment request
  socket.emit('generate_assessment', 'Generate questions on Algebra and Geometry, total marks: 50, duration: 60 minutes, number of questions: 5');
  console.log('Sending complete assessment request...');
  
  // Test Case 2: Incomplete assessment request
  setTimeout(() => {
    socket.emit('generate_assessment', 'Generate questions on Physics');
    console.log('Sending incomplete assessment request...');
  }, 3000);
  
  // Test Case 3: Modification request
  setTimeout(() => {
    socket.emit('modify_assessment', {
      assessmentId: 'test-id',
      modifications: {
        questionType: 'multiple-choice',
        questionIndex: 0
      }
    });
    console.log('Sending modification request...');
  }, 6000);
});

// Response handlers
socket.on('assessment_generated', (assessment) => {
  logger.info('Assessment generated:', assessment);
  console.log('Assessment generated:', assessment);
});

socket.on('request_params', (data) => {
  logger.info('Missing parameters:', data);
  console.log('Missing parameters:', data);
});

socket.on('assessment_modified', (assessment) => {
  logger.info('Assessment modified:', assessment);
  console.log('Assessment modified:', assessment);
});

socket.on('error', (error) => {
  logger.error('Error:', error);
  console.error('Error:', error);
});

socket.on('disconnect', () => {
  logger.info('Disconnected from server');
  console.log('Disconnected from server');
});