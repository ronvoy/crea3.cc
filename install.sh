#!/bin/bash

################################################################################
# CREA Dashboard - Complete Single-Click Deployment Script
# This script creates all files, directories, and deploys the Flask application
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Get project directory
PROJECT_DIR=$(pwd)

print_header "CREA Dashboard - Single-Click Deployment"
print_info "Project directory: $PROJECT_DIR"

# Check Python
print_info "Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi
PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
print_info "Python version: $PYTHON_VERSION"

# Create directory structure
print_info "Creating directory structure..."
mkdir -p data
mkdir -p static/css
mkdir -p static/js
mkdir -p static/img
mkdir -p templates
mkdir -p routes
mkdir -p logs

# Create routes/__init__.py
print_info "Creating routes/__init__.py..."
cat > routes/__init__.py << 'EOF'
# Routes package
EOF

# Create passenger_wsgi.py
print_info "Creating passenger_wsgi.py..."
cat > passenger_wsgi.py << 'EOF'
import sys
import os

# Add your project directory to the sys.path
project_home = os.path.dirname(__file__)
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Import the Flask app
from app import create_app

application = create_app()

# For local development
if __name__ == "__main__":
    # Detect if running locally or on server
    port = int(os.environ.get('PORT', 8081))
    debug = os.environ.get('FLASK_ENV', 'production') == 'development'
    
    application.run(
        host='0.0.0.0',
        port=port,
        debug=debug
    )
EOF

# Create app.py
print_info "Creating app.py..."
cat > app.py << 'EOF'
from flask import Flask
from flask_cors import CORS
import os

def create_app():
    app = Flask(__name__, 
                static_folder='static',
                template_folder='templates')
    
    # Configuration
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max request size
    
    # Enable CORS
    CORS(app, resources={
        r"/api/*": {"origins": "*"},
        r"/chat/*": {"origins": "*"}
    })
    
    # Register blueprints
    from routes.auth import auth_bp
    from routes.chat import chat_bp
    from routes.main import main_bp
    
    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(chat_bp, url_prefix='/api/chat')
    
    return app
EOF

# Create config.py
print_info "Creating config.py..."
cat > config.py << 'EOF'
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    CHAT_API_URL = os.environ.get('CHAT_API_URL', 'http://143.225.28.74:8080/chat')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max request size

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False
    PORT = int(os.environ.get('PORT', 8081))

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False
    PORT = int(os.environ.get('PORT', 5000))
    DOMAIN = os.environ.get('DOMAIN', 'https://crea3.cc')

class TestingConfig(Config):
    """Testing configuration"""
    DEBUG = True
    TESTING = True
    PORT = 5001

# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}

def get_config():
    """Get configuration based on FLASK_ENV"""
    env = os.environ.get('FLASK_ENV', 'development')
    return config.get(env, config['default'])
EOF

# Create routes/auth.py
print_info "Creating routes/auth.py..."
cat > routes/auth.py << 'EOF'
from flask import Blueprint, request, jsonify
import csv
import hashlib
import secrets
import os

auth_bp = Blueprint('auth', __name__)

def hash_password(password):
    """Hash password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def read_users_csv():
    """Read users from CSV file"""
    csv_file = 'data/user.csv'
    
    if not os.path.exists(csv_file):
        return []
    
    users = []
    try:
        with open(csv_file, 'r', encoding='utf-8') as file:
            csv_reader = csv.reader(file)
            next(csv_reader, None)  # Skip header
            
            for row in csv_reader:
                if len(row) >= 3:
                    users.append({
                        'id': row[0],
                        'username': row[1],
                        'password_hash': row[2]
                    })
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return []
    
    return users

@auth_bp.route('/login', methods=['POST', 'OPTIONS'])
def login():
    """Handle user login"""
    
    # Handle preflight requests
    if request.method == 'OPTIONS':
        return '', 200
    
    # Get data from request
    if request.is_json:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
    else:
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()
    
    # Validate input
    if not username or not password:
        return jsonify({
            'success': False,
            'message': 'Username and password are required'
        }), 400
    
    # Hash the provided password
    hashed_password = hash_password(password)
    
    # Read users from CSV
    users = read_users_csv()
    
    if not users:
        return jsonify({
            'success': False,
            'message': 'User database not found'
        }), 500
    
    # Find matching user
    authenticated_user = None
    for user in users:
        if user['username'] == username and user['password_hash'] == hashed_password:
            authenticated_user = user
            break
    
    # Return response
    if authenticated_user:
        # Generate secure token
        token = secrets.token_hex(32)
        
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'token': token,
            'userId': authenticated_user['id'],
            'username': authenticated_user['username']
        }), 200
    else:
        return jsonify({
            'success': False,
            'message': 'Invalid username or password'
        }), 401

@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Handle user logout"""
    return jsonify({
        'success': True,
        'message': 'Logout successful'
    }), 200
EOF

# Create routes/chat.py
print_info "Creating routes/chat.py..."
cat > routes/chat.py << 'EOF'
from flask import Blueprint, request, jsonify
import requests
import os

chat_bp = Blueprint('chat', __name__)

# Chat API configuration
CHAT_API_URL = os.environ.get('CHAT_API_URL', 'http://143.225.28.74:8080/chat')
CHAT_API_TIMEOUT = 30  # seconds

@chat_bp.route('/proxy', methods=['POST', 'OPTIONS'])
def chat_proxy():
    """Proxy requests to the chat API"""
    
    # Handle preflight requests
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        # Get the incoming data
        if not request.is_json:
            return jsonify({
                'error': 'Request must be JSON'
            }), 400
        
        data = request.get_json()
        
        # Validate request
        if 'question' not in data:
            return jsonify({
                'error': 'Missing required field: question'
            }), 400
        
        # Forward request to the chat API
        response = requests.post(
            CHAT_API_URL,
            json=data,
            headers={'Content-Type': 'application/json'},
            timeout=CHAT_API_TIMEOUT
        )
        
        # Check if request was successful
        response.raise_for_status()
        
        # Return the response from the chat API
        return jsonify(response.json()), response.status_code
        
    except requests.exceptions.Timeout:
        return jsonify({
            'error': 'Chat service timeout',
            'answer': 'The chat service is taking too long to respond. Please try again.'
        }), 504
        
    except requests.exceptions.ConnectionError:
        return jsonify({
            'error': 'Chat service unavailable',
            'answer': 'Unable to connect to the chat service. Please try again later.'
        }), 503
        
    except requests.exceptions.HTTPError as e:
        return jsonify({
            'error': f'Chat service error: {e}',
            'answer': 'An error occurred while processing your request. Please try again.'
        }), response.status_code if 'response' in locals() else 500
        
    except Exception as e:
        print(f"Chat proxy error: {e}")
        return jsonify({
            'error': 'Internal server error',
            'answer': 'An unexpected error occurred. Please try again.'
        }), 500

@chat_bp.route('/health', methods=['GET'])
def chat_health():
    """Check if chat service is available"""
    try:
        response = requests.get(
            CHAT_API_URL.replace('/chat', '/health'),
            timeout=5
        )
        return jsonify({
            'status': 'available' if response.status_code == 200 else 'degraded',
            'api_url': CHAT_API_URL
        }), 200
    except:
        return jsonify({
            'status': 'unavailable',
            'api_url': CHAT_API_URL
        }), 503
EOF

# Create routes/main.py
print_info "Creating routes/main.py..."
cat > routes/main.py << 'EOF'
from flask import Blueprint, render_template, send_from_directory
import os

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    """Serve the main dashboard page"""
    return render_template('index.html')

@main_bp.route('/health')
def health():
    """Health check endpoint"""
    return {'status': 'healthy', 'service': 'CREA Dashboard'}, 200

@main_bp.route('/favicon.ico')
def favicon():
    """Serve favicon"""
    return send_from_directory(
        os.path.join(main_bp.root_path, '..', 'static', 'img'),
        'crea3.png',
        mimetype='image/png'
    )

@main_bp.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return '<h1>404 - Page Not Found</h1>', 404

@main_bp.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return '<h1>500 - Internal Server Error</h1>', 500
EOF

# Create requirements.txt
print_info "Creating requirements.txt..."
cat > requirements.txt << 'EOF'
Flask==3.0.0
Flask-CORS==4.0.0
requests==2.31.0
python-dotenv==1.0.0
gunicorn==21.2.0
Werkzeug==3.0.1
EOF

# Create .env file
print_info "Creating .env file..."
cat > .env << 'EOF'
# Flask Configuration
FLASK_APP=passenger_wsgi.py
FLASK_ENV=development
SECRET_KEY=your-secret-key-change-this-in-production

# Server Configuration
PORT=8081

# Chat API Configuration
CHAT_API_URL=http://143.225.28.74:8080/chat

# Domain Configuration (for production)
DOMAIN=https://crea3.cc
EOF

# Create static/css/style.css
print_info "Creating static/css/style.css..."
cat > static/css/style.css << 'EOF'
.chat-widget-container {
    --primary-color: #4f46e5;
    --primary-hover: #4338ca;
    --bg-color: #ffffff;
    --text-color: #1f2937;
    --border-color: #e5e7eb;
    --user-msg-bg: #4f46e5;
    --bot-msg-bg: #f3f4f6;
}

.chat-widget-container * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

.chat-widget-button {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--primary-color);
    color: white;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    z-index: 9998;
}

.chat-widget-button svg {
    width: 28px;
    height: 28px;
}

.chat-widget-button:hover {
    background: var(--primary-hover);
    transform: scale(1.05);
}

.chat-widget-window {
    position: fixed;
    bottom: 90px;
    right: 20px;
    width: 380px;
    height: 550px;
    background: var(--bg-color);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    display: none;
    flex-direction: column;
    z-index: 9999;
    overflow: hidden;
    transition: all 0.3s ease;
}

.chat-widget-window.open {
    display: flex;
}

.chat-widget-header {
    background: var(--primary-color);
    color: white;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.chat-widget-header h3 {
    font-size: 18px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.chat-widget-close {
    background: none;
    border: none;
    color: white;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s;
}

.chat-widget-close:hover {
    background: rgba(255, 255, 255, 0.1);
}

.chat-widget-messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.chat-message {
    display: flex;
    gap: 8px;
    animation: slideIn 0.3s ease;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.chat-message.user {
    flex-direction: row-reverse;
}

.chat-message-content {
    max-width: 75%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.5;
    word-wrap: break-word;
}

.chat-message.user .chat-message-content {
    background: var(--user-msg-bg);
    color: white;
    border-bottom-right-radius: 4px;
}

.chat-message.bot .chat-message-content {
    background: var(--bot-msg-bg);
    color: var(--text-color);
    border-bottom-left-radius: 4px;
}

.chat-widget-input-area {
    padding: 16px 20px;
    border-top: 1px solid var(--border-color);
    display: flex;
    gap: 8px;
}

.chat-widget-input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    outline: none;
    transition: border-color 0.2s;
}

.chat-widget-input:focus {
    border-color: var(--primary-color);
}

.chat-widget-send {
    padding: 10px 20px;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: background 0.2s;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.chat-widget-send:hover:not(:disabled) {
    background: var(--primary-hover);
}

.chat-widget-send:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.typing-indicator {
    display: flex;
    gap: 4px;
    padding: 10px 14px;
}

.typing-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #9ca3af;
    animation: bounce 1.4s infinite;
}

.typing-dot:nth-child(2) {
    animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
    animation-delay: 0.4s;
}

@keyframes bounce {
    0%, 60%, 100% {
        transform: translateY(0);
    }
    30% {
        transform: translateY(-10px);
    }
}

/* Mobile Responsive */
@media (max-width: 480px) {
    .chat-widget-window {
        bottom: 0;
        right: 0;
        left: 0;
        width: 100%;
        height: 100vh;
        border-radius: 0;
    }

    .chat-widget-button {
        bottom: 16px;
        right: 16px;
        width: 56px;
        height: 56px;
    }

    .chat-message-content {
        max-width: 85%;
    }
}

@media (max-width: 420px) and (min-width: 481px) {
    .chat-widget-window {
        width: calc(100vw - 40px);
        right: 20px;
    }
}
EOF

# Create static/js/widget.js
print_info "Creating static/js/widget.js..."
cat > static/js/widget.js << 'EOF'
(function() {
    // Configuration - automatically detect the API URL
    const CONFIG = {
        apiUrl: window.location.origin + '/api/chat/proxy',
        position: 'bottom-right',
        primaryColor: '#4f46e5'
    };

    // Create widget HTML
    const widgetHTML = `
        <div class="chat-widget-container">
            <button class="chat-widget-button" id="chatWidgetButton">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </button>
            <div class="chat-widget-window" id="chatWidgetWindow">
                <div class="chat-widget-header">
                    <h3>Chat Assistant</h3>
                    <button class="chat-widget-close" id="chatWidgetClose">&times;</button>
                </div>
                <div class="chat-widget-messages" id="chatWidgetMessages">
                    <div class="chat-message bot">
                        <div class="chat-message-content">
                            Hi! How can I help you today?
                        </div>
                    </div>
                </div>
                <div class="chat-widget-input-area">
                    <input 
                        type="text" 
                        class="chat-widget-input" 
                        id="chatWidgetInput"
                        placeholder="Type your message..."
                    />
                    <button class="chat-widget-send" id="chatWidgetSend">Send</button>
                </div>
            </div>
        </div>
    `;

    // Insert widget into page
    document.addEventListener('DOMContentLoaded', function() {
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
        initWidget();
    });

    function initWidget() {
        const button = document.getElementById('chatWidgetButton');
        const window = document.getElementById('chatWidgetWindow');
        const closeBtn = document.getElementById('chatWidgetClose');
        const input = document.getElementById('chatWidgetInput');
        const sendBtn = document.getElementById('chatWidgetSend');
        const messagesContainer = document.getElementById('chatWidgetMessages');

        // Toggle widget
        button.addEventListener('click', () => {
            window.classList.toggle('open');
            if (window.classList.contains('open')) {
                input.focus();
            }
        });

        closeBtn.addEventListener('click', () => {
            window.classList.remove('open');
        });

        // Send message
        async function sendMessage() {
            const message = input.value.trim();
            if (!message) return;

            // Add user message
            addMessage(message, 'user');
            input.value = '';
            sendBtn.disabled = true;

            // Show typing indicator
            const typingId = addTypingIndicator();

            try {
                const response = await fetch(CONFIG.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ question: message })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                // Remove typing indicator
                removeTypingIndicator(typingId);
                
                // Add bot response
                addMessage(data.answer || data.response || 'Sorry, I could not process your request.', 'bot');
            } catch (error) {
                console.error('Chat error:', error);
                removeTypingIndicator(typingId);
                addMessage('Sorry, there was an error processing your request. Please try again.', 'bot');
            } finally {
                sendBtn.disabled = false;
                input.focus();
            }
        }

        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        function addMessage(text, type) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${type}`;
            messageDiv.innerHTML = `
                <div class="chat-message-content">${escapeHtml(text)}</div>
            `;
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        function addTypingIndicator() {
            const typingDiv = document.createElement('div');
            typingDiv.className = 'chat-message bot';
            typingDiv.id = 'typing-indicator-' + Date.now();
            typingDiv.innerHTML = `
                <div class="chat-message-content typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            `;
            messagesContainer.appendChild(typingDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            return typingDiv.id;
        }

        function removeTypingIndicator(id) {
            const indicator = document.getElementById(id);
            if (indicator) {
                indicator.remove();
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }
})();
EOF

# Create templates/index.html
print_info "Creating templates/index.html..."
cat > templates/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - Login</title>
    
    <!-- Bootstrap CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Bootstrap Icons -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
    <!-- Particles.js -->
    <script src="https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js"></script>
    <!-- Chat Widget -->
    <script src="{{ url_for('static', filename='js/widget.js') }}"></script>
    <link rel="stylesheet" href="{{ url_for('static', filename='css/style.css') }}">
    
    <style>
        :root {
            --sidebar-width: 250px;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            overflow-x: hidden;
        }
        
        .login-wrapper {
            min-height: 100vh;
            background: linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
        }
        
        #particles-js {
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            z-index: 1;
        }
        
        .login-card {
            max-width: 420px;
            width: 100%;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            animation: slideUp 0.4s ease-out;
            position: relative;
            z-index: 3;
        }
        
        .login-logo {
            width: 150px;
            height: auto;
            margin: 0 auto 1.5rem;
            display: block;
            border-radius: 8px;
        }
        
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .dashboard-wrapper {
            display: flex;
            min-height: 100vh;
            position: relative;
        }
        
        .sidebar {
            width: var(--sidebar-width);
            background: #2c3e50;
            color: white;
            position: fixed;
            height: 100vh;
            transition: transform 0.3s ease;
            z-index: 1000;
        }
        
        .sidebar.collapsed {
            transform: translateX(-100%);
        }
        
        .sidebar-header {
            padding: 1.5rem;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .sidebar-nav {
            padding: 1rem 0;
        }
        
        .nav-link {
            color: rgba(255,255,255,0.8);
            padding: 0.8rem 1.5rem;
            display: flex;
            align-items: center;
            gap: 12px;
            transition: all 0.3s;
            border-left: 3px solid transparent;
        }
        
        .nav-link:hover, .nav-link.active {
            color: white;
            background: rgba(255,255,255,0.1);
            border-left-color: #3498db;
        }
        
        .main-content {
            flex: 1;
            margin-left: 0;
            transition: margin-left 0.3s ease;
            background: #f8f9fa;
            position: relative;
            z-index: 1;
        }
        
        .main-content.with-sidebar {
            margin-left: var(--sidebar-width);
        }
        
        .top-navbar {
            background: white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 1rem 1.5rem;
            position: sticky;
            top: 0;
            z-index: 999;
        }
        
        .stat-card {
            border-radius: 12px;
            border: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            transition: transform 0.3s, box-shadow 0.3s;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.12);
        }
        
        .stat-icon {
            width: 60px;
            height: 60px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }
        
        .overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            z-index: 999;
            display: none;
        }
        
        .overlay.show {
            display: block;
        }
        
        @media (max-width: 768px) {
            .sidebar {
                transform: translateX(-100%);
            }
            
            .sidebar.show {
                transform: translateX(0);
            }
            
            .main-content {
                margin-left: 0;
            }
        }
        
        .btn-logout {
            background: #e74c3c;
            border: none;
            transition: background 0.3s;
        }
        
        .btn-logout:hover {
            background: #c0392b;
        }
    </style>
</head>
<body>
    <!-- Login Page -->
    <div id="loginPage" class="login-wrapper">
        <div id="particles-js"></div>
        
        <div class="login-card p-4 p-md-5">
            <div class="text-center mb-4">
                <h2 class="fw-bold mb-2">Welcome to CREA</h2>
                <p class="text-muted">Please sign in to continue</p>
            </div>
            
            <div id="errorAlert" class="alert alert-danger d-none" role="alert"></div>
            
            <div class="mb-3">
                <label for="username" class="form-label fw-semibold">Username</label>
                <input type="text" class="form-control form-control-lg" id="username" placeholder="Enter username">
            </div>
            
            <div class="mb-4">
                <label for="password" class="form-label fw-semibold">Password</label>
                <input type="password" class="form-control form-control-lg" id="password" placeholder="Enter password">
            </div>
            
            <button onclick="handleLogin()" id="loginBtn" class="btn btn-primary btn-lg w-100 mb-3">
                Sign In
            </button>
            
            <div class="text-center text-muted small">
                <p class="mb-0">Demo: <strong>admin</strong> / <strong>admin123</strong></p>
            </div>
        </div>
    </div>

    <!-- Dashboard Page -->
    <div id="dashboardPage" class="d-none dashboard-wrapper">
        <div id="overlay" class="overlay" onclick="toggleSidebar()"></div>
        
        <!-- Sidebar -->
        <aside id="sidebar" class="sidebar">
            <div class="sidebar-header">
                <h4 class="mb-0 fw-bold"><i class="bi bi-grid-fill me-2"></i>Dashboard</h4>
            </div>
            <nav class="sidebar-nav">
                <a href="#" class="nav-link active">
                    <i class="bi bi-house-door"></i>
                    <span>Home</span>
                </a>
                <a href="#" class="nav-link">
                    <i class="bi bi-people"></i>
                    <span>Users</span>
                </a>
                <a href="#" class="nav-link">
                    <i class="bi bi-bar-chart"></i>
                    <span>Analytics</span>
                </a>
                <a href="#" class="nav-link">
                    <i class="bi bi-gear"></i>
                    <span>Settings</span>
                </a>
            </nav>
        </aside>

        <!-- Main Content -->
        <main id="mainContent" class="main-content">
            <nav class="top-navbar d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center gap-3">
                    <button class="btn btn-link text-dark" onclick="toggleSidebar()">
                        <i class="bi bi-list fs-4"></i>
                    </button>
                    <h5 class="mb-0 fw-bold d-none d-md-block">Dashboard Overview</h5>
                </div>
                
                <div class="d-flex align-items-center gap-3">
                    <span class="d-none d-sm-inline text-muted">Welcome, <strong id="usernameDisplay"></strong></span>
                    <button onclick="handleLogout()" class="btn btn-logout text-white">
                        <i class="bi bi-box-arrow-right me-1"></i>
                        <span class="d-none d-sm-inline">Logout</span>
                    </button>
                </div>
            </nav>

            <div class="container-fluid p-4">
                <h4 class="mb-4 fw-bold">Overview</h4>
                
                <div class="row g-4 mb-4">
                    <div class="col-12 col-sm-6 col-lg-3">
                        <div class="card stat-card">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <p class="text-muted mb-1 small">Total Users</p>
                                        <h3 class="mb-0 fw-bold">1,234</h3>
                                    </div>
                                    <div class="stat-icon bg-primary bg-opacity-10 text-primary">
                                        <i class="bi bi-people-fill"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="col-12 col-sm-6 col-lg-3">
                        <div class="card stat-card">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <p class="text-muted mb-1 small">Active Cases</p>
                                        <h3 class="mb-0 fw-bold">52</h3>
                                    </div>
                                    <div class="stat-icon bg-warning bg-opacity-10 text-warning">
                                        <i class="bi bi-activity"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="col-12 col-sm-6 col-lg-3">
                        <div class="card stat-card">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <p class="text-muted mb-1 small">Resolved Cases</p>
                                        <h3 class="mb-0 fw-bold">12</h3>
                                    </div>
                                    <div class="stat-icon bg-info bg-opacity-10 text-info">
                                        <i class="bi bi-lightbulb-fill"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card stat-card">
                    <div class="card-body">
                        <h5 class="card-title fw-bold mb-4">Recent Activity</h5>
                        
                        <div class="activity-item d-flex align-items-center gap-3 p-3 bg-light rounded mb-3">
                            <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;">
                                <strong>FA</strong>
                            </div>
                            <div class="flex-grow-1">
                                <p class="mb-1 fw-semibold">Prof. Amato logged in</p>
                                <small class="text-muted">2 minutes ago</small>
                            </div>
                        </div>
                        
                        <div class="activity-item d-flex align-items-center gap-3 p-3 bg-light rounded mb-3">
                            <div class="rounded-circle bg-success text-white d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;">
                                <strong>AM</strong>
                            </div>
                            <div class="flex-grow-1">
                                <p class="mb-1 fw-semibold">Prof. Moccardi updated profile</p>
                                <small class="text-muted">15 minutes ago</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    
    <script>
        function initParticles() {
            if (typeof particlesJS !== 'undefined') {
                particlesJS('particles-js', {
                    particles: {
                        number: { value: 80, density: { enable: true, value_area: 800 } },
                        color: { value: ['#00d4ff', '#00b8d4', '#0097a7', '#00838f'] },
                        shape: { type: 'circle' },
                        opacity: { value: 0.5, random: true, anim: { enable: true, speed: 1, opacity_min: 0.1 } },
                        size: { value: 3, random: true, anim: { enable: true, speed: 2, size_min: 0.1 } },
                        line_linked: { enable: true, distance: 150, color: '#00d4ff', opacity: 0.4, width: 1 },
                        move: { enable: true, speed: 2, direction: 'none', out_mode: 'out' }
                    },
                    interactivity: {
                        events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: true, mode: 'push' } },
                        modes: { grab: { distance: 140, line_linked: { opacity: 1 } }, push: { particles_nb: 4 } }
                    }
                });
            }
        }
        
        window.addEventListener('DOMContentLoaded', function() {
            checkAuth();
            if (!sessionStorage.getItem('authToken')) initParticles();
            document.getElementById('password').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') handleLogin();
            });
        });

        function checkAuth() {
            const token = sessionStorage.getItem('authToken');
            const expiry = sessionStorage.getItem('tokenExpiry');
            if (token && expiry && new Date().getTime() < parseInt(expiry)) {
                showDashboard();
                setTimeout(handleLogout, parseInt(expiry) - new Date().getTime());
            } else {
                showLogin();
            }
        }

        async function handleLogin() {
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value.trim();
            const errorAlert = document.getElementById('errorAlert');
            const loginBtn = document.getElementById('loginBtn');
            
            errorAlert.classList.add('d-none');
            if (!username || !password) {
                showError('Please enter both username and password');
                return;
            }
            
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in...';
            
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const expiryTime = new Date().getTime() + (10 * 60 * 1000);
                    sessionStorage.setItem('authToken', data.token);
                    sessionStorage.setItem('tokenExpiry', expiryTime.toString());
                    sessionStorage.setItem('username', username);
                    setTimeout(handleLogout, 10 * 60 * 1000);
                    showDashboard();
                } else {
                    showError(data.message || 'Login failed. Please try again.');
                }
            } catch (error) {
                showError('Connection error. Please check your network and try again.');
                console.error('Login error:', error);
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Sign In';
            }
        }

        function handleLogout() {
            sessionStorage.clear();
            showLogin();
        }

        function showLogin() {
            document.getElementById('loginPage').classList.remove('d-none');
            document.getElementById('dashboardPage').classList.add('d-none');
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
            document.getElementById('errorAlert').classList.add('d-none');
            setTimeout(initParticles, 100);
        }

        function showDashboard() {
            document.getElementById('usernameDisplay').textContent = sessionStorage.getItem('username') || 'User';
            document.getElementById('loginPage').classList.add('d-none');
            document.getElementById('dashboardPage').classList.remove('d-none');
            if (window.innerWidth > 768) {
                document.getElementById('sidebar').classList.remove('collapsed');
                document.getElementById('mainContent').classList.add('with-sidebar');
            } else {
                document.getElementById('sidebar').classList.add('collapsed');
            }
        }

        function showError(message) {
            const errorAlert = document.getElementById('errorAlert');
            errorAlert.textContent = message;
            errorAlert.classList.remove('d-none');
        }

        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('overlay');
            const mainContent = document.getElementById('mainContent');
            
            if (window.innerWidth <= 768) {
                sidebar.classList.toggle('show');
                sidebar.classList.toggle('collapsed');
                overlay.classList.toggle('show');
            } else {
                sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('with-sidebar');
            }
        }

        window.addEventListener('resize', function() {
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.getElementById('mainContent');
            const overlay = document.getElementById('overlay');
            
            if (window.innerWidth > 768) {
                overlay.classList.remove('show');
                sidebar.classList.remove('show');
                if (!sidebar.classList.contains('collapsed')) {
                    mainContent.classList.add('with-sidebar');
                }
            } else {
                mainContent.classList.remove('with-sidebar');
                if (!sidebar.classList.contains('show')) {
                    sidebar.classList.add('collapsed');
                }
            }
        });
    </script>
</body>
</html>
HTMLEOF

# Create data/user.csv with sample credentials
print_info "Creating data/user.csv..."
cat > data/user.csv << 'EOF'
id,username,password_hash
1,admin,240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
EOF

# Create .gitignore
print_info "Creating .gitignore..."
cat > .gitignore << 'EOF'
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/
ENV/

# Flask
instance/
.webassets-cache

# Logs
logs/*.log
*.log

# Environment
.env
.env.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Data
data/*.csv.bak
EOF

# Create README.md
print_info "Creating README.md..."
cat > README.md << 'EOF'
# CREA Dashboard - Flask Application

A modern Flask-based dashboard with authentication and chat widget.

## Quick Start

```bash
# Make script executable
chmod +x setup.sh

# Run the script
./setup.sh
```

## Default Credentials

- Username: `admin`
- Password: `admin123`

## Features

- User authentication with CSV storage
- Chat widget with HTTP to HTTPS proxy
- Responsive Bootstrap 5 design
- Particle effects on login
- Auto port detection (8081 local, 5000 production)

## Manual Start

```bash
source venv/bin/activate
python3 passenger_wsgi.py
```

Access at: http://localhost:8081

## Production Deployment

```bash
export FLASK_ENV=production
export PORT=5000
gunicorn -w 4 -b 0.0.0.0:5000 passenger_wsgi:application
```

## Project Structure

```
├── passenger_wsgi.py       # Main application entry
├── app.py                  # Flask app factory
├── config.py              # Configuration
├── routes/                # API routes
│   ├── auth.py           # Authentication
│   ├── chat.py           # Chat proxy
│   └── main.py           # Main routes
├── static/               # Static files
│   ├── css/style.css    # Chat widget styles
│   └── js/widget.js     # Chat widget JS
├── templates/           # HTML templates
│   └── index.html      # Main dashboard
└── data/               # Data files
    └── user.csv       # User credentials
```

## Environment Variables

Edit `.env` file:

```env
FLASK_ENV=development
PORT=8081
SECRET_KEY=your-secret-key
CHAT_API_URL=http://143.225.28.74:8080/chat
```

## Adding Users

Edit `data/user.csv`:

```csv
id,username,password_hash
2,newuser,<sha256_hash_of_password>
```

Generate hash:
```python
import hashlib
print(hashlib.sha256(b"password").hexdigest())
```
EOF

print_info "Creating virtual environment..."
if [ -d "venv" ]; then
    print_warning "Virtual environment already exists. Removing..."
    rm -rf venv
fi
python3 -m venv venv

print_info "Activating virtual environment..."
source venv/bin/activate

print_info "Installing dependencies..."
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet

print_info "Testing application..."
python3 -c "from app import create_app; app = create_app(); print('✓ Application test passed')"

print_header "Installation Complete!"

echo ""
print_info "Project structure created:"
echo "  ✓ Python files (passenger_wsgi.py, app.py, config.py)"
echo "  ✓ Routes (auth.py, chat.py, main.py)"
echo "  ✓ Static files (CSS, JS)"
echo "  ✓ Templates (index.html)"
echo "  ✓ Data files (user.csv)"
echo "  ✓ Virtual environment"
echo ""

print_info "Default credentials:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""

print_info "To start the application:"
echo ""
echo "  ${GREEN}source venv/bin/activate${NC}"
echo "  ${GREEN}python3 passenger_wsgi.py${NC}"
echo ""

print_info "Or start automatically now? (y/n)"
read -r START_NOW

if [ "$START_NOW" = "y" ] || [ "$START_NOW" = "Y" ]; then
    print_info "Starting application..."
    PORT=$(grep "^PORT=" .env | cut -d'=' -f2)
    PORT=${PORT:-8081}
    
    print_info "Application starting on port $PORT"
    print_info "Access at: ${GREEN}http://localhost:$PORT${NC}"
    print_info "Press Ctrl+C to stop"
    echo ""
    
    python3 passenger_wsgi.py
else
    print_info "Setup complete! Start the application when ready with:"
    echo "  ${GREEN}source venv/bin/activate${NC}"
    echo "  ${GREEN}python3 passenger_wsgi.py${NC}"
fi