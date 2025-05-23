const { pool } = require('../database');
const openRouterService = require('../services/openRouterService');
const openAIService = require('../services/openAIService');

// Store active generation processes
const activeGenerations = new Map();

// Generate painting ideas with real-time status updates
async function generatePaintings(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { titleId, quantity = 5 } = req.body;
  const MAX_PARALLEL = 3; // Reduced for stability
  
  if (!titleId) {
    return res.status(400).json({ error: 'Title ID is required' });
  }
  
  if (quantity < 1 || quantity > 10) {
    return res.status(400).json({ error: 'Quantity must be between 1 and 10' });
  }
  
  try {
    // Get title info
    const [titleRows] = await pool.execute(
      'SELECT id, title, instructions FROM titles WHERE id = ? AND user_id = ?',
      [titleId, req.user.id]
    );
    
    if (titleRows.length === 0) {
      return res.status(404).json({ error: 'Title not found or access denied' });
    }
    
    const title = titleRows[0];
    
    // Get reference images
    const [refRows] = await pool.execute(
      'SELECT id, image_data FROM references2 WHERE title_id = ? OR (user_id = ? AND is_global = 1)',
      [titleId, req.user.id]
    );
    
    const references = refRows.map(row => ({ id: row.id, image_data: row.image_data }));
    
    // Get previous ideas for this title to avoid duplication
    const [prevIdeas] = await pool.execute(
      'SELECT id, summary FROM ideas WHERE title_id = ? ORDER BY created_at DESC',
      [titleId]
    );
    
    // Create placeholder paintings first
    const placeholderPaintings = [];
    for (let i = 0; i < quantity; i++) {
      const [result] = await pool.execute(
        'INSERT INTO paintings (title_id, idea_id, status, created_at) VALUES (?, ?, ?, NOW())',
        [titleId, null, 'creating_prompt'] // Use null instead of 0
      );
      
      placeholderPaintings.push({
        id: result.insertId,
        title_id: titleId,
        idea_id: null,
        status: 'creating_prompt',
        image_url: '',
        image_data: '',
        summary: 'Generating painting concept...',
        created_at: new Date(),
        error_message: '',
        promptDetails: {
          summary: 'Generating painting concept...',
          title: title.title,
          instructions: title.instructions || 'No custom instructions provided',
          referenceCount: references.length,
          referenceImages: [],
          fullPrompt: ''
        }
      });
    }
    
    // Start background processing
    processGenerationInBackground(titleId, title, references, prevIdeas, quantity, placeholderPaintings);
    
    // Return immediately with placeholders
    res.status(200).json({
      message: `Started generating ${quantity} paintings`,
      paintings: placeholderPaintings
    });
  } catch (error) {
    console.error('Error in generatePaintings:', error);
    res.status(500).json({ error: 'Failed to generate paintings: ' + error.message });
  }
}

// Background processing function
async function processGenerationInBackground(titleId, title, references, prevIdeas, quantity, placeholderPaintings) {
  const generationId = `${titleId}_${Date.now()}`;
  activeGenerations.set(generationId, { status: 'running', progress: 0 });
  
  console.log(`Starting background generation for title ${titleId}, quantity: ${quantity}`);
  
  try {
    // Step 1: Generate ideas sequentially
    const newIdeas = [];
    for (let i = 0; i < quantity; i++) {
      try {
        console.log(`Generating idea ${i + 1}/${quantity} for title ${titleId}`);
        
        // Update status to show prompt generation
        await pool.execute(
          'UPDATE paintings SET status = ?, error_message = NULL WHERE id = ?',
          ['creating_prompt', placeholderPaintings[i].id]
        );
        
        const idea = await openRouterService.generateIdeas(
          titleId, 
          title.title, 
          title.instructions,
          [...prevIdeas, ...newIdeas]
        );
        
        newIdeas.push(idea);
        
        // Update the painting with the actual idea_id and new status
        await pool.execute(
          'UPDATE paintings SET idea_id = ?, status = ? WHERE id = ?',
          [idea.id, 'prompt_ready', placeholderPaintings[i].id]
        );
        
        console.log(`Generated idea ${i + 1}/${quantity} for title ${titleId}: ${idea.summary}`);
      } catch (error) {
        console.error(`Error generating idea ${i + 1}:`, error);
        await pool.execute(
          'UPDATE paintings SET status = ?, error_message = ? WHERE id = ?',
          ['failed', `Failed to generate prompt: ${error.message}`, placeholderPaintings[i].id]
        );
      }
    }
    
    // Step 2: Generate images in parallel with concurrency limit
    console.log(`Starting image generation for ${newIdeas.length} ideas`);
    
    const imagePromises = newIdeas.map((idea, index) => {
      const paintingId = placeholderPaintings[index].id;
      return generateImageWithRetry(idea, references, paintingId);
    });
    
    // Process with concurrency limit
    await processWithConcurrencyLimit(imagePromises, 3);
    
    activeGenerations.delete(generationId);
    console.log(`Completed generation process for title ${titleId}`);
    
  } catch (error) {
    console.error(`Error in background processing for title ${titleId}:`, error);
    activeGenerations.delete(generationId);
  }
}

// Generate image with retry logic
async function generateImageWithRetry(idea, references, paintingId, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Generating image for idea ${idea.id}, attempt ${attempt}`);
      
      // Update status to generating image
      await pool.execute(
        'UPDATE paintings SET status = ?, error_message = NULL WHERE id = ?',
        ['generating_image', paintingId]
      );
      
      const result = await openAIService.generateImage(idea.id, idea.fullPrompt, references);
      
      console.log(`Successfully generated image for idea ${idea.id} on attempt ${attempt}`);
      return result;
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed for idea ${idea.id}:`, error);
      
      if (attempt === maxRetries) {
        await pool.execute(
          'UPDATE paintings SET status = ?, error_message = ? WHERE id = ?',
          ['failed', `Failed after ${maxRetries} attempts: ${error.message}`, paintingId]
        );
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}

// Process promises with concurrency limit
async function processWithConcurrencyLimit(promises, limit) {
  const results = [];
  for (let i = 0; i < promises.length; i += limit) {
    const batch = promises.slice(i, i + limit);
    console.log(`Processing batch ${Math.floor(i/limit) + 1}, size: ${batch.length}`);
    const batchResults = await Promise.allSettled(batch);
    results.push(...batchResults);
    
    // Small delay between batches to prevent overwhelming the APIs
    if (i + limit < promises.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return results;
}

// Get status of all paintings for a title
async function getPaintings(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { titleId } = req.params;

  if (!titleId) {
    return res.status(400).json({ error: 'Title ID is required' });
  }

  try {
    // Verify title belongs to user
    const [titleCheck] = await pool.execute(
      'SELECT id FROM titles WHERE id = ? AND user_id = ?',
      [titleId, req.user.id]
    );
    
    if (titleCheck.length === 0) {
      return res.status(404).json({ error: 'Title not found or access denied' });
    }
    
    const paintingQuery = `
      SELECT p.id, p.title_id, p.idea_id, p.image_url, p.image_data, p.status, 
             p.created_at, p.error_message, p.used_reference_ids,
             COALESCE(i.summary, 'Generating concept...') as summary, 
             COALESCE(i.full_prompt, '') as fullPrompt,
             t.title as title_text, 
             t.instructions as title_instructions
      FROM paintings p
      LEFT JOIN ideas i ON p.idea_id = i.id AND p.idea_id > 0
      JOIN titles t ON p.title_id = t.id
      WHERE p.title_id = ?
      ORDER BY p.created_at DESC
    `;
    
    const [paintingRows] = await pool.execute(paintingQuery, [titleId]);

    if (!paintingRows || paintingRows.length === 0) {
      return res.status(200).json({ paintings: [], referenceDataMap: {} });
    }

    // Get reference data for paintings that have used references
    const allReferenceIds = new Set();
    paintingRows.forEach(row => {
      if (row.used_reference_ids) {
        try {
          const refIds = JSON.parse(row.used_reference_ids);
          if (refIds && Array.isArray(refIds)) {
            refIds.forEach(id => {
              if (id != null) allReferenceIds.add(id);
            });
          }
        } catch (e) {
          console.error(`Error parsing used_reference_ids for painting ${row.id}:`, e.message);
        }
      }
    });

    let serverReferenceDataMap = {};
    const uniqueRefIdsArray = Array.from(allReferenceIds);

    if (uniqueRefIdsArray.length > 0) {
      try {
        const placeholders = uniqueRefIdsArray.map(() => '?').join(',');
        const [actualRefDataRows] = await pool.execute(
          `SELECT id, image_data FROM references2 WHERE id IN (${placeholders})`,
          uniqueRefIdsArray
        );
        actualRefDataRows.forEach(refRow => {
          serverReferenceDataMap[refRow.id] = refRow.image_data;
        });
      } catch (refQueryError) {
        console.error(`Error fetching reference data:`, refQueryError);
      }
    }

    const paintingsWithDetails = paintingRows.map(row => {
      let usedRefIdsList = [];
      let referenceCount = 0;

      if (row.used_reference_ids) {
        try {
          const refIds = JSON.parse(row.used_reference_ids);
          if (refIds && Array.isArray(refIds) && refIds.length > 0) {
            usedRefIdsList = refIds.filter(id => id != null);
            referenceCount = usedRefIdsList.length;
          }
        } catch (e) {
          console.error(`Error parsing used_reference_ids for painting ${row.id}:`, e.message);
        }
      }
      
      const promptDetails = {
        summary: row.summary || 'Generating concept...',
        title: row.title_text || 'Unknown Title',
        instructions: row.title_instructions || 'No custom instructions provided',
        referenceCount: referenceCount,
        referenceImages: usedRefIdsList,
        fullPrompt: row.fullPrompt || ''
      };

      return {
        id: row.id,
        idea_id: row.idea_id,
        title_id: row.title_id,
        image_url: row.image_url || '',
        image_data: row.image_data || '',
        status: row.status || 'unknown',
        created_at: row.created_at || new Date(),
        error_message: row.error_message || '',
        summary: row.summary || 'Generating concept...',
        fullPrompt: row.fullPrompt || '',
        full_prompt: row.fullPrompt || '',
        promptDetails: promptDetails
      };
    });
    
    res.status(200).json({ 
      paintings: paintingsWithDetails, 
      referenceDataMap: serverReferenceDataMap 
    });

  } catch (error) {
    console.error(`Error in getPaintings:`, error);
    res.status(500).json({ error: `Failed to get paintings: ${error.message}` });
  }
}

// Regenerate a single painting
async function regeneratePainting(req, res) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { paintingId } = req.params;

  try {
    // Get painting info
    const [paintingRows] = await pool.execute(
      `SELECT p.*, t.title, t.instructions, t.user_id 
       FROM paintings p 
       JOIN titles t ON p.title_id = t.id 
       WHERE p.id = ?`,
      [paintingId]
    );

    if (paintingRows.length === 0) {
      return res.status(404).json({ error: 'Painting not found' });
    }

    const painting = paintingRows[0];
    
    if (painting.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Reset painting status
    await pool.execute(
      'UPDATE paintings SET status = ?, error_message = NULL, image_url = NULL, image_data = NULL WHERE id = ?',
      ['creating_prompt', paintingId]
    );

    // Get references
    const [refRows] = await pool.execute(
      'SELECT id, image_data FROM references2 WHERE title_id = ? OR (user_id = ? AND is_global = 1)',
      [painting.title_id, req.user.id]
    );
    
    const references = refRows.map(row => ({ id: row.id, image_data: row.image_data }));

    // Start regeneration process
    regeneratePaintingInBackground(painting, references);

    res.status(200).json({ message: 'Regeneration started' });

  } catch (error) {
    console.error('Error in regeneratePainting:', error);
    res.status(500).json({ error: 'Failed to regenerate painting: ' + error.message });
  }
}

async function regeneratePaintingInBackground(painting, references) {
  try {
    // Generate new idea
    const idea = await openRouterService.generateIdeas(
      painting.title_id,
      painting.title,
      painting.instructions,
      []
    );

    // Update with new idea
    await pool.execute(
      'UPDATE paintings SET idea_id = ?, status = ? WHERE id = ?',
      [idea.id, 'prompt_ready', painting.id]
    );

    // Generate image
    await generateImageWithRetry(idea, references, painting.id);

  } catch (error) {
    console.error('Error in regeneration:', error);
    await pool.execute(
      'UPDATE paintings SET status = ?, error_message = ? WHERE id = ?',
      ['failed', `Regeneration failed: ${error.message}`, painting.id]
    );
  }
}

module.exports = {
  generatePaintings,
  getPaintings,
  regeneratePainting
}; 