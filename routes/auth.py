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
