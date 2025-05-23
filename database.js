const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
});

// Test database connection
pool.on('connection', function (connection) {
  console.log('Database connected as id ' + connection.threadId);
});

pool.on('error', function(err) {
  console.error('Database error:', err);
  if(err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('Database connection lost, attempting to reconnect...');
  } else {
    throw err;
  }
});

async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // Create users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create titles table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS titles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        instructions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create references2 table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS references2 (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title_id INT,
        user_id INT NOT NULL,
        image_data LONGTEXT NOT NULL,
        is_global BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create ideas table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ideas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title_id INT NOT NULL,
        summary TEXT NOT NULL,
        full_prompt TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE
      )
    `);
    
    // Create paintings table with proper schema
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS paintings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title_id INT NOT NULL,
        idea_id INT NULL,
        image_url VARCHAR(255),
        image_data LONGTEXT,
        status ENUM('pending', 'creating_prompt', 'prompt_ready', 'generating_image', 'processing', 'completed', 'failed') DEFAULT 'pending',
        error_message TEXT,
        used_reference_ids TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
      )
    `);
    
    // Migrate existing tables if needed
    try {
      await connection.execute(`
        ALTER TABLE paintings 
        MODIFY COLUMN status ENUM('pending', 'creating_prompt', 'prompt_ready', 'generating_image', 'processing', 'completed', 'failed') DEFAULT 'pending'
      `);
      console.log('Updated paintings table status enum');
    } catch (alterError) {
      console.log('Paintings table status enum already up to date');
    }
    
    try {
      await connection.execute(`
        ALTER TABLE paintings 
        MODIFY COLUMN idea_id INT NULL
      `);
      console.log('Updated paintings table idea_id to be nullable');
    } catch (alterError) {
      console.log('Paintings table idea_id already nullable');
    }
    
    try {
      await connection.execute(`
        ALTER TABLE paintings 
        MODIFY COLUMN error_message TEXT
      `);
      console.log('Updated paintings table error_message to TEXT');
    } catch (alterError) {
      console.log('Paintings table error_message already TEXT');
    }
    
    connection.release();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

module.exports = { pool, initializeDatabase }; 