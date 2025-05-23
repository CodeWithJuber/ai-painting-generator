const axios = require('axios');
const { pool } = require('../database');
require('dotenv').config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Updated getReferenceImages function - only get title-specific references
async function getReferenceImages(titleId) {
  try {
    console.log(`🔍 FETCHING REFERENCE IMAGES FOR TITLE ${titleId}`);
    
    // Only get references for this specific title, not global ones
    const [references] = await pool.execute(
      'SELECT id, title_id, is_global, image_data, created_at FROM references2 WHERE title_id = ? ORDER BY created_at DESC',
      [titleId]
    );
    
    console.log(`📸 FOUND ${references.length} TITLE-SPECIFIC REFERENCE IMAGES:`);
    references.forEach((ref, index) => {
      console.log(`   Reference ${index + 1}:`);
      console.log(`   - ID: ${ref.id}`);
      console.log(`   - Title ID: ${ref.title_id}`);
      console.log(`   - Is Global: ${ref.is_global}`);
      console.log(`   - Created: ${ref.created_at}`);
      console.log(`   - Image data length: ${ref.image_data ? ref.image_data.length : 'NULL'}`);
    });
    
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
        content: `You are a creative painting designer who generates painting concepts that STRICTLY match uploaded reference images.

CRITICAL RULES - MUST FOLLOW:
1. If reference images show a SINGLE PERSON/PORTRAIT, generate PORTRAIT painting concepts of that same subject type
2. If reference images show REALISTIC PEOPLE/PORTRAITS, you MUST generate REALISTIC portrait painting concepts
3. NEVER generate complex scenes, classrooms, or multiple people when reference shows a single person
4. NEVER generate anime, cartoon, or fantasy themes when reference images show realistic people
5. The painting concept MUST match the EXACT subject type and style of the reference images
6. Focus on REALISTIC, achievable painting concepts that match the reference aesthetic
7. If references show professional photography, generate professional portrait painting concepts

PORTRAIT REFERENCE RULES:
- Single person reference = Single person portrait concept
- Professional photo reference = Professional portrait painting concept
- Realistic reference = Realistic painting style

FORBIDDEN when realistic portrait references are provided:
- Anime style
- Cartoon style  
- Fantasy themes
- Complex scenes with multiple people
- Classroom or narrative scenes
- Abstract art
- Surreal concepts`
      }
    ];

    // Create user message content with stronger enforcement
    let userContent = [];
    
    // Add text instruction with stronger reference enforcement
    if (referenceImages.length > 0) {
      userContent.push({
        type: 'text',
        text: `REFERENCE IMAGES PROVIDED: You have ${referenceImages.length} reference image(s) attached below.

MANDATORY REQUIREMENTS:
- ANALYZE the reference images first to understand the SUBJECT TYPE and VISUAL STYLE
- If references show realistic portraits/photos of people, generate REALISTIC portrait painting concepts
- If references show people, create portrait-style painting concepts featuring similar subjects  
- MATCH the lighting, composition, and mood of the reference images
- Generate concepts that could realistically be painted to match the reference style
- STRICTLY AVOID anime, cartoon, or fantasy themes unless the reference images are in those styles

Title: "${titleText}"
${instructions ? `Custom instructions: ${instructions}` : ''}
${previousIdeasSummary}

CRITICAL: The painting concept MUST match the style and subject type shown in the reference images. If the references show realistic people, generate realistic portrait concepts. DO NOT default to anime or cartoon styles.`
      });
    } else {
      userContent.push({
        type: 'text',
        text: `Create a painting concept for the title: "${titleText}".
${instructions ? `Custom instructions: ${instructions}` : ''}
${previousIdeasSummary}

No reference images provided. Generate a creative painting concept based on the title and instructions.`
      });
    }

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
          description: 'Save a painting idea that STRICTLY matches the reference images style and subject',
          parameters: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'A short summary of the painting idea that MATCHES the reference style and subject. If references show realistic people, describe a realistic portrait concept (30-50 words)'
              },
              fullPrompt: {
                type: 'string',
                description: 'The full prompt to generate this painting image, ensuring it MATCHES the reference images subject type and style. If references show realistic people, create a realistic portrait prompt, NOT anime or cartoon (100-200 words with detailed visual instructions)'
              }
            },
            required: ['summary', 'fullPrompt']
          }
        }
      }],
      tool_choice: { type: 'function', function: { name: 'savePaintingIdea' } },
      max_tokens: 1000,
      temperature: 0.3 // Lower temperature for more consistent results
    };

    const response = await axios.post(OPENROUTER_URL, requestData, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'AI Painting Generator'
      },
      timeout: 60000
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

    // Enhanced validation to catch anime/cartoon AND complex scenes when portrait references exist
    if (referenceImages.length > 0) {
      const isAnimeResponse = ideaData.summary.toLowerCase().includes('anime') || 
                             ideaData.fullPrompt.toLowerCase().includes('anime') ||
                             ideaData.summary.toLowerCase().includes('cartoon') ||
                             ideaData.fullPrompt.toLowerCase().includes('cartoon');
      
      // Check if it's a complex scene when we have portrait references
      const isComplexScene = ideaData.fullPrompt.toLowerCase().includes('classroom') ||
                             ideaData.fullPrompt.toLowerCase().includes('teacher') ||
                             ideaData.fullPrompt.toLowerCase().includes('student') ||
                             ideaData.fullPrompt.toLowerCase().includes('thought bubble') ||
                             ideaData.fullPrompt.toLowerCase().includes('multiple people') ||
                             ideaData.fullPrompt.toLowerCase().includes('scene with');
      
      if (isAnimeResponse) {
        console.log('⚠️ Detected anime/cartoon response despite realistic references - forcing realistic style');
        ideaData.summary = ideaData.summary.replace(/anime|cartoon/gi, 'realistic portrait');
        ideaData.fullPrompt = ideaData.fullPrompt.replace(/anime|cartoon/gi, 'realistic portrait painting');
      }
      
      if (isComplexScene) {
        console.log('⚠️ Detected complex scene response for portrait reference - creating proper portrait concept');
        
        // Create a proper portrait concept based on the reference
        ideaData.summary = `A realistic portrait painting capturing the subject's likeness and character in a professional style that matches the reference image.`;
        
        ideaData.fullPrompt = `A realistic portrait painting of a person, painted in a classical portrait style. The composition should match the reference image with similar lighting, professional background treatment, and framing. Focus on capturing the subject's facial features, expression, and attire details with realistic proportions and professional painting techniques. Use traditional portrait painting methods with careful attention to skin tones, fabric textures, and overall composition that reflects the style and quality of the reference photograph. Professional studio lighting and clean background treatment.`;
      }
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