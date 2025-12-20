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
