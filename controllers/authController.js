const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../database');
require('dotenv').config();

// Register a new user
async function register(req, res) {
  const { username, email, password } = req.body;
  
  // Validate input
  if (!username || !email || !password) {
    return res.status(400).json({ 
      error: 'All fields are required',
      details: {
        username: !username ? 'Username is required' : null,
        email: !email ? 'Email is required' : null,
        password: !password ? 'Password is required' : null
      }
    });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  
  // Validate password strength
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  
  // Validate username
  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long' });
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
  }
  
  try {
    // Check if user already exists (check email and username separately for better error messages)
    const [existingEmail] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase()]
    );
    
    if (existingEmail.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    
    const [existingUsername] = await pool.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    
    if (existingUsername.length > 0) {
      return res.status(409).json({ error: 'This username is already taken' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create user
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password, created_at) VALUES (?, ?, ?, NOW())',
      [username, email.toLowerCase(), hashedPassword]
    );
    
    // Generate token
    const token = jwt.sign(
      { id: result.insertId, username, email: email.toLowerCase() },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log(`New user registered: ${username} (${email})`);
    
    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: result.insertId,
        username,
        email: email.toLowerCase()
      },
      token
    });
  } catch (error) {
    console.error('Error registering user:', error);
    
    // Handle specific database errors
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('email')) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      } else if (error.message.includes('username')) {
        return res.status(409).json({ error: 'This username is already taken' });
      }
      return res.status(409).json({ error: 'Account already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
}

// Login user
async function login(req, res) {
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return res.status(400).json({ 
      error: 'Email and password are required',
      details: {
        email: !email ? 'Email is required' : null,
        password: !password ? 'Password is required' : null
      }
    });
  }
  
  try {
    // Find user (case-insensitive email)
    const [users] = await pool.execute(
      'SELECT id, username, email, password FROM users WHERE LOWER(email) = LOWER(?)',
      [email]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const user = users[0];
    
    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Generate token
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log(`User logged in: ${user.username} (${user.email})`);
    
    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}

// Get current user
async function getMe(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Get fresh user data from database
    const [users] = await pool.execute(
      'SELECT id, username, email, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = users[0];
    
    res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
}

module.exports = {
  register,
  login,
  getMe
}; 