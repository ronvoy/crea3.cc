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
