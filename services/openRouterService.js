const axios = require('axios');
const { pool } = require('../database');
require('dotenv').config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Function to generate painting ideas using OpenRouter with function calling
async function generateIdeas(titleId, titleText, instructions, previousIdeas = []) {
  try {
    if (!titleId) {
      throw new Error('Title ID is required for idea generation');
    }
    
    if (!titleText) {
      throw new Error('Title text is required for idea generation');
    }
    
    if (!OPENROUTER_API_KEY) {
      throw new Error('OpenRouter API key is missing. Please check your .env file.');
    }

    // Validate API key format
    if (!OPENROUTER_API_KEY.startsWith('sk-or-v1-')) {
      throw new Error('Invalid OpenRouter API key format. Key should start with "sk-or-v1-"');
    }
    
    // Get previous ideas for context
    const previousIdeasSummary = previousIdeas.length > 0 
      ? `Previous painting ideas: ${previousIdeas.map(idea => idea.summary).join('; ')}`
      : '';
    
    console.log('Making OpenRouter API request with model: google/gemini-2.5-flash-preview');
    
    const requestData = {
      model: 'google/gemini-2.5-flash-preview',
      messages: [
        { role: 'system', content: 'You are a creative painting designer. Generate unique painting concepts that haven\'t been suggested before.' },
        { role: 'user', content: `Create a painting concept for the title: "${titleText}".
          ${instructions ? `Custom instructions: ${instructions}` : ''}
          ${previousIdeasSummary}
          Please generate a completely new and different painting idea that hasn't been suggested yet.`
        }
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'savePaintingIdea',
          description: 'Save a painting idea',
          parameters: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'A short summary of the painting idea (30-50 words)'
              },
              fullPrompt: {
                type: 'string',
                description: 'The full prompt to generate this painting image (100-200 words with detailed visual instructions)'
              }
            },
            required: ['summary', 'fullPrompt']
          }
        }
      }],
      tool_choice: { type: 'function', function: { name: 'savePaintingIdea' } }
    };

    const response = await axios.post(OPENROUTER_URL, requestData, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000', // Optional: helps with rate limiting
        'X-Title': 'AI Painting Generator' // Optional: helps with tracking
      },
      timeout: 30000 // 30 second timeout
    });

    if (!response.data || !response.data.choices || !response.data.choices[0]) {
      throw new Error('Invalid response structure from OpenRouter API');
    }

    const choice = response.data.choices[0];
    if (!choice.message || !choice.message.tool_calls || !choice.message.tool_calls[0]) {
      throw new Error('No tool calls found in OpenRouter response');
    }

    const toolCall = choice.message.tool_calls[0];
    const ideaData = JSON.parse(toolCall.function.arguments);

    if (!ideaData.summary || !ideaData.fullPrompt) {
      throw new Error('Incomplete idea data received from AI');
    }

    // Save to database
    const params = [titleId, ideaData.summary, ideaData.fullPrompt];
    
    // Validate parameters
    if (params.some(p => p === undefined || p === null)) {
      console.error('Attempted to execute query with invalid parameter:', { params });
      throw new Error('Invalid query parameter detected');
    }
    
    const [result] = await pool.execute(
      'INSERT INTO ideas (title_id, summary, full_prompt) VALUES (?, ?, ?)',
      params
    );

    const idea = {
      id: result.insertId,
      titleId,
      summary: ideaData.summary,
      fullPrompt: ideaData.fullPrompt
    };

    console.log('Successfully generated and saved idea:', idea.id);
    return idea;

  } catch (error) {
    console.error('Error generating ideas:', error);
    
    // Provide more specific error messages
    if (error.response) {
      console.error('OpenRouter API Error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
      
      if (error.response.status === 404) {
        throw new Error('OpenRouter API model not found. The model may have been deprecated. Please check the model name.');
      } else if (error.response.status === 401) {
        throw new Error('OpenRouter API authentication failed. Please check your API key.');
      } else if (error.response.status === 429) {
        throw new Error('OpenRouter API rate limit exceeded. Please try again later.');
      }
    }
    
    throw error;
  }
}

module.exports = { generateIdeas }; 