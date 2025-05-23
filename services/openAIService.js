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

// Enhanced function to analyze reference images with subject-focused analysis
async function analyzeReferenceImages(references) {
  if (!references || references.length === 0) {
    console.log('No reference images provided for analysis');
    return null;
  }

  try {
    console.log(`\n🔍 ANALYZING ${references.length} REFERENCE IMAGES FOR SUBJECT & STYLE MATCHING`);
    
    // Prepare images for Vision API
    const imageMessages = references.slice(0, 2).map((ref, index) => {
      console.log(`📸 Processing reference image ${index + 1}`);
      return {
        type: "image_url",
        image_url: {
          url: ref.image_data,
          detail: "high"
        }
      };
    });

    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are an expert image analyzer for AI art generation. Analyze these reference images and provide EXACT specifications for generating similar images.

CRITICAL ANALYSIS - ANSWER EACH SECTION:

1. MAIN SUBJECT IDENTIFICATION:
   - What is the primary subject? (person, man, woman, child, animal, object, landscape, etc.)
   - Age and gender if it's a person
   - Specific characteristics of the subject
   - Pose, expression, or positioning

2. VISUAL STYLE & MEDIUM:
   - Photography type (portrait, headshot, full body, etc.)
   - Art style (realistic photo, digital art, painting, sketch, etc.)
   - Quality level (professional, amateur, artistic, etc.)

3. LIGHTING & MOOD:
   - Lighting setup (studio, natural, dramatic, soft, etc.)
   - Light direction and intensity
   - Overall mood (serious, happy, dramatic, casual, etc.)

4. COMPOSITION & FRAMING:
   - Camera angle (front view, profile, 3/4 view, etc.)
   - Framing (close-up, medium shot, full body, etc.)
   - Background (solid color, blurred, detailed, etc.)

5. COLOR & TONE:
   - Dominant colors
   - Color temperature (warm, cool, neutral)
   - Contrast level (high, medium, low)

6. TECHNICAL STYLE:
   - Image quality (sharp, soft, grainy, etc.)
   - Depth of field
   - Any special effects or filters

IMPORTANT: Focus on describing the SUBJECT TYPE first, then the visual style. If it's a man, say "man" clearly. If it's a woman, say "woman" clearly. Be very specific about what the main subject is.`
          },
          ...imageMessages
        ]
      }
    ];

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: messages,
      max_tokens: 1200,
      temperature: 0.1
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    const analysis = response.data.choices[0].message.content;
    console.log('\n📋 DETAILED REFERENCE ANALYSIS:');
    console.log('='.repeat(80));
    console.log(analysis);
    console.log('='.repeat(80));
    
    return analysis;
    
  } catch (error) {
    console.error('❌ Error analyzing reference images:', error);
    return `Professional portrait photography of a person with studio lighting, realistic rendering, clean composition, and high-quality photographic techniques. Natural pose and expression.`;
  }
}

// Enhanced function to create subject-focused prompt
function createSubjectMatchedPrompt(originalPrompt, referenceAnalysis) {
  if (!referenceAnalysis) {
    return originalPrompt;
  }

  return `REFERENCE IMAGE ANALYSIS (MUST MATCH EXACTLY):
${referenceAnalysis}

GENERATION REQUIREMENTS:
1. SUBJECT MATCHING: The main subject type MUST match the reference (if reference shows a man, generate a man; if woman, generate woman, etc.)
2. STYLE MATCHING: Use the exact same visual style, lighting, and composition as described above
3. POSE & EXPRESSION: Match the pose, expression, and positioning from the reference
4. TECHNICAL SPECS: Apply the same photographic technique, lighting setup, and image quality
5. BACKGROUND: Use similar background treatment as the reference
6. COLOR PALETTE: Match the color scheme and mood from the reference

SUBJECT DESCRIPTION TO APPLY THE STYLE TO:
${originalPrompt}

FINAL INSTRUCTION: 
- Generate the subject described in the prompt using EXACTLY the same type of subject, style, lighting, and composition as the reference images
- If the reference shows a man, the output must show a man
- If the reference shows a woman, the output must show a woman  
- Match the age, pose, expression, and overall appearance style
- DO NOT create abstract, surreal, or fantasy art unless the reference is abstract
- Focus on realistic representation that clearly matches the reference subject type and style`;
}

// Enhanced image generation with better subject matching
async function generateImage(ideaId, prompt, references = []) {
  try {
    console.log(`\n🎨 STARTING SUBJECT-MATCHED IMAGE GENERATION`);
    console.log(`📝 Idea ID: ${ideaId}`);
    console.log(`🖼️  Reference images: ${references.length}`);
    console.log(`📄 Original prompt: ${prompt.substring(0, 150)}...`);
    
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key is missing. Please check your .env file.');
    }
    
    if (!ideaId) {
      throw new Error('Idea ID is required for image generation');
    }
    
    // Update status to processing
    await pool.execute(
      'UPDATE paintings SET status = ? WHERE idea_id = ?',
      ['processing', ideaId]
    );

    let finalPrompt = prompt;
    
    if (references && references.length > 0) {
      console.log('\n🔍 ANALYZING REFERENCE IMAGES FOR SUBJECT & STYLE MATCHING...');
      
      const referenceAnalysis = await analyzeReferenceImages(references);
      
      if (referenceAnalysis) {
        finalPrompt = createSubjectMatchedPrompt(prompt, referenceAnalysis);
        
        console.log('\n📝 SUBJECT-MATCHED PROMPT CREATED:');
        console.log('─'.repeat(80));
        console.log(finalPrompt.substring(0, 1500) + '...');
        console.log('─'.repeat(80));
      }
    } else {
      console.log('⚠️  No reference images provided - using original prompt');
    }

    // Enhanced DALL-E 3 settings for better subject matching
    const requestBody = {
      model: 'dall-e-3',
      prompt: finalPrompt.substring(0, 4000),
      size: '1024x1024',
      quality: 'hd',
      style: 'natural', // Natural style for realistic representation
      n: 1,
      response_format: 'b64_json'
    };

    console.log('\n🚀 SENDING SUBJECT-MATCHED REQUEST TO DALL-E 3...');
    
    const response = await axios.post('https://api.openai.com/v1/images/generations', requestBody, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000
    });

    console.log('✅ DALL-E 3 RESPONSE RECEIVED');

    // Extract and save image
    const imageData = response.data.data[0].b64_json;
    if (!imageData) {
      throw new Error('No image data received from OpenAI API');
    }

    const fileName = `painting_${ideaId}_${Date.now()}.png`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));
    console.log(`💾 Image saved: ${fileName}`);

    // Update database
    const referenceIds = references.map(ref => ref.id).filter(id => id != null);
    const usedReferenceIdsJSON = referenceIds.length > 0 ? JSON.stringify(referenceIds) : null;

    await pool.execute(
      'UPDATE paintings SET image_url = ?, image_data = ?, status = ?, used_reference_ids = ? WHERE idea_id = ?',
      [`uploads/${fileName}`, `data:image/png;base64,${imageData}`, 'completed', usedReferenceIdsJSON, ideaId]
    );

    console.log('✅ DATABASE UPDATED - SUBJECT-MATCHED GENERATION COMPLETE\n');

    return {
      ideaId,
      imageUrl: `uploads/${fileName}`,
      status: 'completed'
    };

  } catch (error) {
    console.error(`❌ ERROR IN IMAGE GENERATION:`, error);
    
    let errorMessage = error.message;
    if (error.response) {
      console.error('OpenAI API Error:', error.response.data);
      errorMessage = `OpenAI API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
    }
    
    try {
      await pool.execute(
        'UPDATE paintings SET status = ?, error_message = ? WHERE idea_id = ?',
        ['failed', errorMessage.substring(0, 500), ideaId]
      );
    } catch (dbError) {
      console.error('Database update error:', dbError);
    }
    
    throw error;
  }
}

// Function to regenerate a failed painting
async function regenerateImage(paintingId) {
  try {
    console.log(`🔄 STARTING REGENERATION FOR PAINTING ${paintingId}`);
    
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
    
    // Get reference images
    const [references] = await pool.execute(
      'SELECT id, image_data FROM references2 WHERE title_id = ? OR is_global = 1',
      [painting.title_id]
    );
    
    console.log(`📸 Found ${references.length} reference images for regeneration`);
    
    // Reset status
    await pool.execute(
      'UPDATE paintings SET status = ?, error_message = NULL WHERE id = ?',
      ['generating_image', paintingId]
    );
    
    // Regenerate with subject matching
    const result = await generateImage(painting.idea_id, painting.full_prompt, references);
    
    console.log(`✅ REGENERATION COMPLETE FOR PAINTING ${paintingId}`);
    return result;
    
  } catch (error) {
    console.error(`❌ REGENERATION ERROR:`, error);
    
    try {
      await pool.execute(
        'UPDATE paintings SET status = ?, error_message = ? WHERE id = ?',
        ['failed', error.message.substring(0, 500), paintingId]
      );
    } catch (dbError) {
      console.error('Database error during regeneration failure:', dbError);
    }
    
    throw error;
  }
}

module.exports = { generateImage, regenerateImage }; 