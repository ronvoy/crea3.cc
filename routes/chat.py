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
