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

// Enhanced function to analyze reference images without identifying people
async function analyzeReferenceImages(references) {
  if (!references || references.length === 0) {
    console.log('No reference images provided for analysis');
    return null;
  }

  try {
    console.log(`\n🔍 ANALYZING ${references.length} REFERENCE IMAGES FOR STYLE MATCHING`);
    
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
            text: `Analyze these reference images for TECHNICAL and ARTISTIC characteristics only. DO NOT identify or describe any people. Focus ONLY on:

TECHNICAL ANALYSIS (NO PERSON IDENTIFICATION):

1. PHOTOGRAPHY STYLE:
   - Is this a professional studio photograph, casual photo, or artistic image?
   - Camera settings apparent (shallow/deep depth of field, etc.)
   - Image quality and resolution characteristics

2. LIGHTING SETUP:
   - Studio lighting vs natural lighting vs dramatic lighting
   - Light direction (front-lit, side-lit, backlit)
   - Soft vs hard lighting quality
   - Shadow characteristics and contrast levels

3. COMPOSITION ELEMENTS:
   - Framing style (tight crop, medium shot, wide shot)
   - Background treatment (solid color, blurred, detailed environment)
   - Overall composition balance and rule of thirds usage

4. COLOR CHARACTERISTICS:
   - Color palette (warm, cool, neutral tones)
   - Saturation levels (vibrant, muted, desaturated)
   - Color temperature and mood
   - Any color grading or filters applied

5. ARTISTIC STYLE:
   - Realistic photography vs stylized vs artistic interpretation
   - Professional commercial style vs casual vs artistic
   - Any post-processing effects or artistic treatments

6. VISUAL MOOD:
   - Professional/formal vs casual/relaxed atmosphere
   - Clean/minimal vs detailed/busy composition
   - Modern vs classic vs vintage aesthetic

Provide specific technical details that can guide image generation to match this exact photographic and artistic style, focusing purely on the technical and aesthetic aspects.`
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
    
    // Enhanced fallback analysis based on common portrait characteristics
    console.log('🔄 Using enhanced fallback analysis for portrait-style images');
    return `TECHNICAL STYLE ANALYSIS:
1. PHOTOGRAPHY STYLE: Professional portrait photography with studio-quality setup
2. LIGHTING SETUP: Professional studio lighting with soft, even illumination from multiple angles
3. COMPOSITION: Clean portrait composition with subject as main focus, professional framing
4. COLOR CHARACTERISTICS: Professional color grading with natural skin tones and balanced exposure
5. ARTISTIC STYLE: High-quality realistic photography with commercial/professional standards
6. VISUAL MOOD: Professional, clean, and polished aesthetic suitable for commercial use
7. BACKGROUND: Clean, professional background treatment (likely solid or softly blurred)
8. TECHNICAL QUALITY: High resolution, sharp focus, professional camera work with proper exposure

STYLE INSTRUCTION: Generate images with professional photography quality, studio lighting setup, clean composition, and realistic photographic rendering that matches commercial portrait photography standards.`;
  }
}

// Enhanced function to create style-matched prompt
function createStyleMatchedPrompt(originalPrompt, referenceAnalysis) {
  if (!referenceAnalysis) {
    return originalPrompt;
  }

  // Detect if we're dealing with realistic photography references
  const isPhotographicReference = referenceAnalysis.toLowerCase().includes('photograph') || 
                                 referenceAnalysis.toLowerCase().includes('studio') ||
                                 referenceAnalysis.toLowerCase().includes('professional');

  // Check if the original prompt is asking for anime/cartoon
  const isAnimeRequest = originalPrompt.toLowerCase().includes('anime') || 
                        originalPrompt.toLowerCase().includes('cartoon') ||
                        originalPrompt.toLowerCase().includes('manga') ||
                        originalPrompt.toLowerCase().includes('animated');

  // If we have photographic references but anime is requested, we need to be explicit
  if (isPhotographicReference && isAnimeRequest) {
    return `STYLE CONFLICT RESOLUTION:
The reference images show photographic/realistic style, but the request is for anime/cartoon style.

REFERENCE TECHNICAL ELEMENTS TO ADAPT:
${referenceAnalysis}

ANIME ADAPTATION INSTRUCTIONS:
- Convert the photographic composition to anime/manga style
- Maintain the lighting mood and direction from the reference
- Adapt the color palette to anime aesthetics
- Keep the same framing and composition structure
- Use anime/manga artistic techniques while preserving the reference's mood

ANIME SUBJECT TO CREATE:
${originalPrompt}

FINAL INSTRUCTION: Create this in anime/manga style while adapting the composition, lighting mood, and color palette from the photographic reference.`;
  }

  // If we have photographic references and no anime request, stay realistic
  if (isPhotographicReference && !isAnimeRequest) {
    return `PHOTOGRAPHIC STYLE MATCHING REQUIREMENTS:
${referenceAnalysis}

REALISTIC PHOTOGRAPHY INSTRUCTIONS:
- Generate a realistic photograph, NOT anime or cartoon style
- Use professional photography techniques and lighting
- Match the exact technical specifications from the reference analysis
- Maintain photographic realism and quality
- Use the same composition, lighting, and background treatment
- Apply professional color grading and exposure settings

PHOTOGRAPHIC SUBJECT TO CREATE:
${originalPrompt}

CRITICAL: Generate this as a realistic photograph using professional photography standards, matching the technical style described in the reference analysis. DO NOT use anime, cartoon, or illustrated styles.`;
  }

  // Default case - use reference elements
  return `REFERENCE STYLE ELEMENTS TO INCORPORATE:
${referenceAnalysis}

STYLE ADAPTATION INSTRUCTIONS:
- Match the composition and framing style from the reference
- Use similar lighting mood and direction
- Apply comparable color palette and atmosphere
- Maintain the same level of quality and technical standards

SUBJECT TO CREATE:
${originalPrompt}

INSTRUCTION: Create this subject while incorporating the technical and artistic elements from the reference analysis.`;
}

// Enhanced image generation with better style matching
async function generateImage(ideaId, prompt, references = []) {
  try {
    console.log(`\n🎨 STARTING STYLE-MATCHED IMAGE GENERATION`);
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
      console.log('\n🔍 ANALYZING REFERENCE IMAGES FOR STYLE MATCHING...');
      
      const referenceAnalysis = await analyzeReferenceImages(references);
      
      if (referenceAnalysis) {
        finalPrompt = createStyleMatchedPrompt(prompt, referenceAnalysis);
        
        console.log('\n📝 STYLE-MATCHED PROMPT CREATED:');
        console.log('─'.repeat(80));
        console.log(finalPrompt.substring(0, 1500) + '...');
        console.log('─'.repeat(80));
      }
    } else {
      console.log('⚠️  No reference images provided - using original prompt');
    }

    // Enhanced DALL-E 3 settings
    const requestBody = {
      model: 'dall-e-3',
      prompt: finalPrompt.substring(0, 4000),
      size: '1024x1024',
      quality: 'hd',
      style: 'natural', // Force natural style for realism
      n: 1,
      response_format: 'b64_json'
    };

    // Add explicit style instruction if we have photographic references
    if (references && references.length > 0) {
      requestBody.prompt = `IMPORTANT: Generate a realistic photograph, NOT anime or cartoon style. ${requestBody.prompt}`;
    }

    console.log('\n🚀 SENDING STYLE-MATCHED REQUEST TO DALL-E 3...');
    
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

    console.log('✅ DATABASE UPDATED - STYLE-MATCHED GENERATION COMPLETE\n');

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
    
    // Regenerate with style matching
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