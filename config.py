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
