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

- Username: `unina`
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
