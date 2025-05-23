const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { pool } = require('../database');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Function to generate an image using OpenAI's DALL-E model
async function generateImage(ideaId, prompt, references = []) {
  try {
    console.log(`Starting image generation for idea ${ideaId}`);
    console.log(`Using API key: ${OPENAI_API_KEY ? 'API key exists' : 'NO API KEY FOUND!'}`);
    
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key is missing. Please check your .env file.');
    }
    
    if (!ideaId) {
      throw new Error('Idea ID is required for image generation');
    }
    
    // First update status to processing
    await pool.execute(
      'UPDATE paintings SET status = ? WHERE idea_id = ?',
      ['processing', ideaId]
    );
    console.log(`Updated status to processing for idea ${ideaId}`);

    // Prepare the prompt with reference context if available
    let enhancedPrompt = prompt;
    if (references && references.length > 0) {
      enhancedPrompt = `${prompt}\n\nStyle reference: Create this image inspired by the uploaded reference images, maintaining their artistic style and visual elements.`;
    }

    // Use DALL-E 3 for image generation
    const requestBody = {
      model: 'dall-e-3',
      prompt: enhancedPrompt.substring(0, 4000), // DALL-E 3 has a 4000 character limit
      size: '1024x1024', // DALL-E 3 supports: 1024x1024, 1024x1792, 1792x1024
      quality: 'standard', // 'standard' or 'hd'
      n: 1,
      response_format: 'b64_json'
    };

    console.log('Making request to OpenAI DALL-E 3 with payload:', JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post('https://api.openai.com/v1/images/generations', requestBody, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000 // 2 minutes timeout
    });

    console.log('OpenAI DALL-E response received');

    // Extract image data
    const imageData = response.data.data[0].b64_json;
    if (!imageData) {
      throw new Error('No image data received from OpenAI API');
    }

    console.log('Successfully extracted image data from response');

    // Save image to disk
    const fileName = `painting_${ideaId}_${Date.now()}.png`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));
    console.log(`Saved image to ${filePath}`);

    // Prepare reference IDs for database
    const referenceIds = references.map(ref => ref.id).filter(id => id != null);
    const usedReferenceIdsJSON = referenceIds.length > 0 ? JSON.stringify(referenceIds) : null;

    // Update database with image URL and status
    await pool.execute(
      'UPDATE paintings SET image_url = ?, image_data = ?, status = ?, used_reference_ids = ? WHERE idea_id = ?',
      [`uploads/${fileName}`, `data:image/png;base64,${imageData}`, 'completed', usedReferenceIdsJSON, ideaId]
    );
    console.log(`Updated database status to completed for idea ${ideaId}`);

    return {
      ideaId,
      imageUrl: `uploads/${fileName}`,
      status: 'completed'
    };

  } catch (error) {
    console.error(`Error generating image for idea ${ideaId}:`, error);
    
    // Update database with error status
    let errorMessage = error.message;
    if (error.response) {
      console.error('OpenAI API Error Response:', error.response.data);
      errorMessage = `OpenAI API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
    }
    
    try {
      await pool.execute(
        'UPDATE paintings SET status = ?, error_message = ? WHERE idea_id = ?',
        ['failed', errorMessage.substring(0, 500), ideaId]
      );
    } catch (dbError) {
      console.error('Error updating database with failure status:', dbError);
    }
    
    throw error;
  }
}

// Function to regenerate a failed painting
async function regenerateImage(paintingId) {
  try {
    console.log(`Starting regeneration for painting ${paintingId}`);
    
    // Get painting and idea details
    const [paintings] = await pool.execute(`
      SELECT p.*, i.full_prompt, i.title_id 
      FROM paintings p 
      JOIN ideas i ON p.idea_id = i.id 
      WHERE p.id = ?
    `, [paintingId]);
    
    if (paintings.length === 0) {
      throw new Error('Painting not found');
    }
    
    const painting = paintings[0];
    
    // Get reference images for this title
    const [references] = await pool.execute(
      'SELECT id, image_data FROM references2 WHERE title_id = ? OR is_global = 1',
      [painting.title_id]
    );
    
    // Reset painting status
    await pool.execute(
      'UPDATE paintings SET status = ?, error_message = NULL WHERE id = ?',
      ['generating_image', paintingId]
    );
    
    // Generate new image
    const result = await generateImage(painting.idea_id, painting.full_prompt, references);
    
    console.log(`Successfully regenerated painting ${paintingId}`);
    return result;
    
  } catch (error) {
    console.error(`Error regenerating painting ${paintingId}:`, error);
    
    // Update with error status
    try {
      await pool.execute(
        'UPDATE paintings SET status = ?, error_message = ? WHERE id = ?',
        ['failed', error.message.substring(0, 500), paintingId]
      );
    } catch (dbError) {
      console.error('Error updating database with regeneration failure:', dbError);
    }
    
    throw error;
  }
}

module.exports = { generateImage, regenerateImage }; 