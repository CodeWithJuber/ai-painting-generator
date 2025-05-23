const axios = require('axios');
const { pool } = require('../database');
require('dotenv').config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Function to get reference images for a title
async function getReferenceImages(titleId) {
  try {
    const [references] = await pool.execute(
      'SELECT id, image_data FROM references2 WHERE title_id = ? OR is_global = 1',
      [titleId]
    );
    return references;
  } catch (error) {
    console.error('Error fetching reference images:', error);
    return [];
  }
}

// Function to generate painting ideas using OpenRouter with reference image awareness
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
    
    // Get reference images for this title
    const referenceImages = await getReferenceImages(titleId);
    console.log(`📸 Found ${referenceImages.length} reference images for idea generation`);
    
    // Get previous ideas for context
    const previousIdeasSummary = previousIdeas.length > 0 
      ? `Previous painting ideas: ${previousIdeas.map(idea => idea.summary).join('; ')}`
      : '';
    
    console.log('Making OpenRouter API request with model: google/gemini-2.5-flash-preview');
    
    // Build messages array with reference images if available
    const messages = [
      { 
        role: 'system', 
        content: `You are a creative painting designer who generates painting concepts that match uploaded reference images.

IMPORTANT RULES:
1. If reference images are provided, the painting concept MUST match the subject type and style of those images
2. If reference shows a person (man/woman), generate portrait-style concepts featuring similar subjects
3. If reference shows objects/landscapes, generate concepts featuring similar subjects
4. Match the visual style, mood, and composition of the reference images
5. Generate realistic, achievable painting concepts, not abstract or surreal art unless the reference is abstract
6. Focus on the SUBJECT TYPE first (person, object, landscape, etc.) then apply creative variations`
      }
    ];

    // Create user message content
    let userContent = [];
    
    // Add text instruction
    userContent.push({
      type: 'text',
      text: `Create a painting concept for the title: "${titleText}".
${instructions ? `Custom instructions: ${instructions}` : ''}
${previousIdeasSummary}

${referenceImages.length > 0 ? 
  `REFERENCE IMAGES PROVIDED: You have ${referenceImages.length} reference image(s). 
  CRITICAL: Analyze these images and generate a painting concept that matches the SUBJECT TYPE and STYLE shown in the references.
  - If the reference shows a person, create a portrait-style concept
  - If the reference shows an object, create a concept featuring similar objects
  - Match the visual style, lighting, and mood of the reference images
  - Generate a realistic painting concept that could actually match the reference style` :
  'No reference images provided. Generate a creative painting concept based on the title and instructions.'
}

Please generate a completely new painting idea that ${referenceImages.length > 0 ? 'matches the reference images' : 'hasn\'t been suggested yet'}.`
    });

    // Add reference images to the message (limit to 2 for API efficiency)
    if (referenceImages.length > 0) {
      const imagesToInclude = referenceImages.slice(0, 2);
      imagesToInclude.forEach((ref, index) => {
        userContent.push({
          type: 'image_url',
          image_url: {
            url: ref.image_data,
            detail: 'high'
          }
        });
      });
    }

    messages.push({
      role: 'user',
      content: userContent
    });
    
    const requestData = {
      model: 'google/gemini-2.5-flash-preview',
      messages: messages,
      tools: [{
        type: 'function',
        function: {
          name: 'savePaintingIdea',
          description: 'Save a painting idea that matches the reference images',
          parameters: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'A short summary of the painting idea that matches the reference style and subject (30-50 words)'
              },
              fullPrompt: {
                type: 'string',
                description: 'The full prompt to generate this painting image, ensuring it matches the reference images\' subject type and style (100-200 words with detailed visual instructions)'
              }
            },
            required: ['summary', 'fullPrompt']
          }
        }
      }],
      tool_choice: { type: 'function', function: { name: 'savePaintingIdea' } },
      max_tokens: 1000,
      temperature: 0.7
    };

    const response = await axios.post(OPENROUTER_URL, requestData, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'AI Painting Generator'
      },
      timeout: 60000 // Increased timeout for image processing
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

    console.log(`✅ Successfully generated ${referenceImages.length > 0 ? 'reference-matched' : 'creative'} idea:`, idea.id);
    console.log(`📝 Summary: ${ideaData.summary.substring(0, 100)}...`);
    
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