const { pool } = require('../database');

// Create a new title
async function createTitle(req, res) {
  console.log('CreateTitle called with:', {
    user: req.user ? { id: req.user.id, username: req.user.username } : null,
    body: req.body
  });

  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { title, instructions } = req.body;
  const userId = req.user.id;
  
  console.log('Parsed values:', { title, instructions, userId });
  
  if (!title || title.trim() === '') {
    console.error('Title is missing or empty');
    return res.status(400).json({ error: 'Title is required' });
  }
  
  try {
    const params = [userId, title.trim(), instructions || null];
    console.log('SQL parameters:', params);
    
    // Validate parameters
    if (params.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { params });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }

    const [result] = await pool.execute(
      'INSERT INTO titles (user_id, title, instructions) VALUES (?, ?, ?)',
      params
    );
    
    console.log('Insert result:', result);
    
    const newTitle = {
      id: result.insertId,
      title: title.trim(),
      instructions: instructions || null,
      created_at: new Date()
    };
    
    console.log('Sending response:', newTitle);
    res.status(201).json(newTitle);
  } catch (error) {
    console.error('Error creating title:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sql: error.sql
    });
    res.status(500).json({ error: 'Failed to create title: ' + error.message });
  }
}

// Get all titles for the current user
async function getTitles(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.id;
  
  try {
    const params = [userId];
    // Validate parameters
    if (params.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { params });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }

    const [rows] = await pool.execute(
      'SELECT id, title, instructions, created_at FROM titles WHERE user_id = ? ORDER BY created_at DESC',
      params
    );
    
    res.status(200).json({ titles: rows });
  } catch (error) {
    console.error('Error getting titles:', error);
    res.status(500).json({ error: 'Failed to get titles' });
  }
}

// Get a single title by ID
async function getTitle(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const userId = req.user.id;
  
  if (!id) {
    return res.status(400).json({ error: 'Title ID is required' });
  }
  
  try {
    const params = [id, userId];
    // Validate parameters
    if (params.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { params });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }

    const [rows] = await pool.execute(
      'SELECT id, title, instructions, created_at FROM titles WHERE id = ? AND user_id = ?',
      params
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Title not found' });
    }
    
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error getting title:', error);
    res.status(500).json({ error: 'Failed to get title' });
  }
}

// Update a title
async function updateTitle(req, res) {
  console.log('UpdateTitle called with:');
  console.log('- req.params:', req.params);
  console.log('- req.body:', req.body);
  console.log('- req.user:', req.user);

  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly:', req.user);
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const { title, instructions } = req.body;
  const userId = req.user.id;
  
  // Convert id to number to ensure it's not undefined
  const titleId = parseInt(id);
  
  console.log('Parsed values:');
  console.log('- titleId:', titleId, typeof titleId);
  console.log('- title:', title, typeof title);
  console.log('- instructions:', instructions, typeof instructions);
  console.log('- userId:', userId, typeof userId);
  
  if (!titleId || isNaN(titleId)) {
    console.error('Invalid title ID:', id);
    return res.status(400).json({ error: 'Valid title ID is required' });
  }
  
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  
  if (!userId) {
    console.error('User ID is missing from request');
    return res.status(401).json({ error: 'User authentication error' });
  }
  
  try {
    const params = [title, instructions || null, titleId, userId];
    console.log('Final SQL parameters:', params);
    console.log('Parameter types:', params.map(p => `${p} (${typeof p})`));
    
    // Validate parameters
    if (params.some(p => p === undefined || p === null && typeof p !== 'object')) {
      console.error('Invalid parameter detected:', { params });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }

    const [result] = await pool.execute(
      'UPDATE titles SET title = ?, instructions = ? WHERE id = ? AND user_id = ?',
      params
    );
    
    console.log('Update result:', result);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Title not found or you don\'t have permission to update it' });
    }
    
    res.status(200).json({
      id: titleId,
      title,
      instructions,
      updated_at: new Date()
    });
  } catch (error) {
    console.error('Error updating title:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sql: error.sql
    });
    res.status(500).json({ error: 'Failed to update title' });
  }
}

// Delete a title
async function deleteTitle(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const userId = req.user.id;
  
  if (!id) {
    return res.status(400).json({ error: 'Title ID is required' });
  }
  
  try {
    const params = [id, userId];
    // Validate parameters
    if (params.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { params });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }

    const [result] = await pool.execute(
      'DELETE FROM titles WHERE id = ? AND user_id = ?',
      params
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Title not found or you don\'t have permission to delete it' });
    }
    
    res.status(200).json({ message: 'Title deleted successfully' });
  } catch (error) {
    console.error('Error deleting title:', error);
    res.status(500).json({ error: 'Failed to delete title' });
  }
}

module.exports = {
  createTitle,
  getTitles,
  getTitle,
  updateTitle,
  deleteTitle
}; 