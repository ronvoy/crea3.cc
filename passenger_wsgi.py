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
