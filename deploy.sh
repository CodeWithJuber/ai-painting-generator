 #!/bin/bash

SERVER_IP="24.199.111.233"
SERVER_USER="root"

echo "Deploying to Digital Ocean server..."

# Create deployment package
tar -czf deploy.tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=uploads \
    --exclude=logs \
    .

# Upload to server
scp deploy.tar.gz $SERVER_USER@$SERVER_IP:/root/

# Deploy on server
ssh $SERVER_USER@$SERVER_IP << 'EOF'
    # Stop existing application
    pkill -f "node server.js" || true
    
    # Create application directory
    mkdir -p /root/painting-generator
    cd /root/painting-generator
    
    # Extract files
    tar -xzf /root/deploy.tar.gz
    
    # Install Node.js if not installed
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        apt-get install -y nodejs
    fi
    
    # Install Docker if not installed
    if ! command -v docker &> /dev/null; then
        apt-get update
        apt-get install -y docker.io docker-compose
        systemctl start docker
        systemctl enable docker
    fi
    
    # Install dependencies
    npm install
    
    # Start MySQL container
    docker-compose up -d
    
    # Wait for MySQL
    sleep 30
    
    # Initialize database
    node database.js
    
    # Start application
    nohup node server.js > app.log 2>&1 &
    
    echo "Deployment complete!"
    echo "Access at: http://24.199.111.233:3000"
EOF

rm deploy.tar.gz
echo "Deployment finished!"