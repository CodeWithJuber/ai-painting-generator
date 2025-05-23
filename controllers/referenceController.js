const { pool } = require('../database');

// Upload a reference image
async function uploadReference(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    console.log('🖼️ REFERENCE UPLOAD STARTED');
    const { titleId, imageData, isGlobal } = req.body;
    const userId = req.user.id;

    console.log('Upload details:', {
      titleId: titleId,
      userId: userId,
      isGlobal: isGlobal,
      hasImageData: !!imageData
    });

    // Validate required fields
    if (!titleId || !imageData) {
      return res.status(400).json({ error: 'Title ID and image data are required' });
    }

    // Clear old references for this title first
    console.log(`🗑️ CLEARING OLD REFERENCES FOR TITLE ${titleId}`);
    const [deleteResult] = await pool.execute(
      'DELETE FROM references2 WHERE title_id = ? AND user_id = ?',
      [titleId, userId]
    );
    console.log(`✅ CLEARED ${deleteResult.affectedRows} OLD REFERENCES`);

    // Insert new reference with correct title_id (not global)
    const [result] = await pool.execute(
      'INSERT INTO references2 (title_id, image_data, is_global, user_id) VALUES (?, ?, ?, ?)',
      [titleId, imageData, 0, userId] // Set is_global to 0 for title-specific
    );

    console.log(`✅ REFERENCE UPLOADED SUCCESSFULLY - ID: ${result.insertId} for TITLE: ${titleId}`);

    res.json({
      success: true,
      id: result.insertId,
      titleId: titleId,
      message: 'Reference image uploaded successfully'
    });
  } catch (error) {
    console.error('❌ REFERENCE UPLOAD ERROR:', error);
    res.status(500).json({ error: 'Failed to upload reference image' });
  }
}

// Get reference images for a title or global references
async function getReferences(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { titleId } = req.params; // titleId is undefined for /global, or a string for /:titleId
  const userId = req.user.id;

  try {
    let query, params;

    // Check if titleId is defined (meaning it came from /:titleId route)
    // Also handle the case where the route param might literally be 'global' if routes change
    if (titleId !== undefined && titleId !== 'global') {
      // Get title-specific references
      // Safeguard: Ensure titleId is not empty or invalid if needed, though route matching usually handles this
      if (!titleId) {
           return res.status(400).json({ error: 'Title ID is required for specific references' });
      }
      query = 'SELECT id, image_data, created_at FROM references2 WHERE title_id = ? AND user_id = ? AND is_global = 0'; // Assuming title refs are not global
      params = [titleId, userId];
    } else {
      // Get global references (titleId is undefined or the string 'global')
      query = 'SELECT id, image_data, created_at FROM references2 WHERE user_id = ? AND is_global = 1';
      params = [userId];
    }

    // Ensure params are not undefined before executing (safeguard)
    if (params.some(p => p === undefined)) {
       console.error('Attempted to execute query with undefined parameter:', { query, params, titleId, userId });
       // Provide a clearer error for debugging
       return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected.' });
    }
    
    const [rows] = await pool.execute(query, params);
    
    res.status(200).json({ references: rows });
  } catch (error) {
    // Log the specific titleId if available for better debugging
    console.error(`Error getting reference images (titleId: ${titleId}):`, error);
    res.status(500).json({ error: 'Failed to get reference images' });
  }
}

// Delete a reference image
async function deleteReference(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const userId = req.user.id;
  
  if (!id) {
    return res.status(400).json({ error: 'Reference ID is required' });
  }
  
  try {
    const params = [id, userId];
    // Validate parameters
    if (params.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { params });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }

    const [result] = await pool.execute(
      'DELETE FROM references2 WHERE id = ? AND user_id = ?',
      params
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Reference image not found or you don\'t have permission to delete it' });
    }
    
    res.status(200).json({ message: 'Reference image deleted successfully' });
  } catch (error) {
    console.error('Error deleting reference image:', error);
    res.status(500).json({ error: 'Failed to delete reference image' });
  }
}

// Add this function to clear old references
const clearOldReferences = async (req, res) => {
  try {
    const { titleId } = req.params;
    const userId = req.user.id;

    console.log(`🗑️ CLEARING OLD REFERENCES FOR TITLE ${titleId}`);

    const [result] = await pool.execute(
      'DELETE FROM references2 WHERE title_id = ? AND user_id = ?',
      [titleId, userId]
    );

    console.log(`✅ CLEARED ${result.affectedRows} OLD REFERENCES`);

    res.json({
      success: true,
      deletedCount: result.affectedRows,
      message: 'Old references cleared successfully'
    });
  } catch (error) {
    console.error('❌ ERROR CLEARING REFERENCES:', error);
    res.status(500).json({ error: 'Failed to clear old references' });
  }
};

module.exports = {
  uploadReference,
  getReferences,
  deleteReference,
  clearOldReferences
}; 