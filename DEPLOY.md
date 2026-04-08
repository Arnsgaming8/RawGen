# Deployment Guide - RawGen

## GitHub Repository
Push code to: https://github.com/Arnsgaming8/RawGen

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/Arnsgaming8/RawGen.git
git push -u origin main
```

## Deploy to Render (Recommended - FREE)

1. **Push code to GitHub** (see above)
2. **Go to Render.com**
   - Sign up with GitHub
3. **Create New Web Service**
   - Connect your GitHub repo
   - Select "Python" as environment
4. **Settings:**
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python server.py`
   - **Environment**: `PYTHON_VERSION=3.9`
5. **Click "Create Web Service"**
6. **Wait for deployment** (~2 minutes)
7. **Your site is live!** (URL will be like `https://rawgen.onrender.com`)

## Deploy to Heroku

1. **Push code to GitHub**
2. **Go to Heroku Dashboard**
3. **Create New App**
4. **Connect to GitHub**
5. **Deploy**
6. **Site is live!**

## Deploy to PythonAnywhere

1. **Upload files** via Files tab
2. **Go to Web tab**
3. **Add a new web app**
4. **Select "Manual configuration"**
5. **Select Python 3.9**
6. **Set WSGI file** to run `server.py`

## Local Testing

```bash
cd J-System5
python server.py
# Open http://localhost:8000
```

## Important Notes

- **This is a Python app** - requires backend server
- **Frontend only** won't work (needs `/api/pollinations` endpoint)
- **Pollinations AI** is free but may rate-limit
- **HuggingFace API** is backup (optional key for higher limits)

## Files Included

- `index.html` - Frontend interface
- `style.css` - Cyberpunk theme
- `script.js` - Frontend logic
- `server.py` - Python backend (REQUIRED)
- `requirements.txt` - Python deps (empty - uses stdlib)
- `README.md` - Documentation
- `LICENSE` - CC BY-NC-ND 4.0

## Troubleshooting

**502 Error**: Server crashed - restart it
**API Failures**: Pollinations rate-limiting, wait and retry
**CORS Issues**: Frontend must be served by same backend (not file://)
