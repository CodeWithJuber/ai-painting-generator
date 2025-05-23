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

// Enhanced function to create style-matched prompt with length control
function createStyleMatchedPrompt(originalPrompt, referenceAnalysis) {
  if (!referenceAnalysis) {
    return originalPrompt;
  }

  // Check if the original prompt is asking for realistic portraits vs. anime/cartoon
  const isRealisticRequest = originalPrompt.toLowerCase().includes('realistic') || 
                           originalPrompt.toLowerCase().includes('photograph') ||
                           originalPrompt.toLowerCase().includes('portrait');
  
  const isAnimeRequest = originalPrompt.toLowerCase().includes('anime') || 
                        originalPrompt.toLowerCase().includes('cartoon') ||
                        originalPrompt.toLowerCase().includes('manga');

  // Create a condensed version of the reference analysis
  const condensedAnalysis = condenseReferenceAnalysis(referenceAnalysis);

  // If reference suggests portrait style but prompt asks for anime, adjust accordingly
  if (referenceAnalysis.toLowerCase().includes('portrait') && 
      referenceAnalysis.toLowerCase().includes('professional') && 
      !isAnimeRequest) {
    
    const stylePrompt = `REFERENCE STYLE: ${condensedAnalysis}

STYLE REQUIREMENTS:
- Use professional portrait composition and lighting as described
- Apply realistic photographic quality and technical specifications
- Match the background treatment and color palette from reference
- Use similar camera angle and subject positioning

SUBJECT: ${originalPrompt}

INSTRUCTION: Generate this subject using the exact visual style, lighting, and composition described in the reference analysis with professional photographic quality.`;

    // Ensure we don't exceed 4000 characters
    return truncatePrompt(stylePrompt, 3900);
  }

  // For anime/cartoon requests, still try to match some style elements
  const artisticPrompt = `REFERENCE ELEMENTS: ${condensedAnalysis}

STYLE ADAPTATION:
- Adapt composition and framing from reference
- Use similar lighting mood and color palette
- Maintain quality and attention to detail

SUBJECT: ${originalPrompt}

INSTRUCTION: Create this subject incorporating the composition, lighting, and quality elements from the reference.`;

  return truncatePrompt(artisticPrompt, 3900);
}

// Function to condense reference analysis to key points
function condenseReferenceAnalysis(analysis) {
  if (!analysis || analysis.length < 500) {
    return analysis;
  }

  // Extract key technical points
  const keyPoints = [];
  
  // Extract lighting info
  const lightingMatch = analysis.match(/lighting[^.]*\./gi);
  if (lightingMatch) {
    keyPoints.push(lightingMatch[0]);
  }
  
  // Extract composition info
  const compositionMatch = analysis.match(/composition[^.]*\./gi);
  if (compositionMatch) {
    keyPoints.push(compositionMatch[0]);
  }
  
  // Extract color info
  const colorMatch = analysis.match(/color[^.]*\./gi);
  if (colorMatch) {
    keyPoints.push(colorMatch[0]);
  }
  
  // Extract style info
  const styleMatch = analysis.match(/(professional|studio|portrait)[^.]*\./gi);
  if (styleMatch) {
    keyPoints.push(styleMatch[0]);
  }

  // If we couldn't extract key points, truncate the original
  if (keyPoints.length === 0) {
    return analysis.substring(0, 800) + "...";
  }

  return keyPoints.join(' ').substring(0, 800);
}

// Function to safely truncate prompt to specified length
function truncatePrompt(prompt, maxLength) {
  if (prompt.length <= maxLength) {
    return prompt;
  }
  
  // Try to truncate at a sentence boundary
  const truncated = prompt.substring(0, maxLength);
  const lastSentence = truncated.lastIndexOf('.');
  
  if (lastSentence > maxLength * 0.8) {
    return truncated.substring(0, lastSentence + 1);
  }
  
  // If no good sentence boundary, truncate at word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.substring(0, lastSpace) + '...';
}

// Updated generateImage function with better prompt length control
async function generateImage(ideaId, prompt, references = []) {
  try {
    console.log(`\n🎨 STARTING STYLE-MATCHED IMAGE GENERATION`);
    console.log(`📝 Idea ID: ${ideaId}`);
    console.log(`🖼️  Reference images: ${references.length}`);
    console.log(`📄 Original prompt length: ${prompt.length} characters`);
    
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
        
        console.log(`\n📝 STYLE-MATCHED PROMPT CREATED (${finalPrompt.length} chars):`);
        console.log('─'.repeat(80));
        console.log(finalPrompt.substring(0, 500) + '...');
        console.log('─'.repeat(80));
      }
    } else {
      console.log('⚠️  No reference images provided - using original prompt');
    }

    // Ensure final prompt is within limits
    if (finalPrompt.length > 4000) {
      console.log(`⚠️  Prompt too long (${finalPrompt.length} chars), truncating to 3900...`);
      finalPrompt = truncatePrompt(finalPrompt, 3900);
      console.log(`✅ Truncated prompt length: ${finalPrompt.length} chars`);
    }

    // Enhanced DALL-E 3 settings
    const requestBody = {
      model: 'dall-e-3',
      prompt: finalPrompt,
      size: '1024x1024',
      quality: 'hd',
      style: 'natural', // Natural style for better realism
      n: 1,
      response_format: 'b64_json'
    };

    console.log(`\n🚀 SENDING REQUEST TO DALL-E 3 (${finalPrompt.length} chars)...`);
    
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