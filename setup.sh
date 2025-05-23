#!/bin/bash

echo "Setting up AI Painting Generator..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Start MySQL container
echo "Starting MySQL container..."
docker-compose up -d

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
sleep 30

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

# Run database migrations
echo "Running database migrations..."
node database.js

echo "Setup complete! You can now start the application with 'npm start'" 