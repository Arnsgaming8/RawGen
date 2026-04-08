# RawGen - AI Image Generator

An unrestricted AI image generator with a cyberpunk dark theme. Create stunning images from text descriptions without any content filtering.

## Features

- **Unrestricted Generation**: No content filters or restrictions
- **Smart Anatomy Correction**: Automatically fixes distorted people/creatures
- **Gallery System**: Save and manage your generated images
- **Live Loading Bar**: Visual progress indicator during generation
- **Cancel Generation**: Stop generation at any time
- **Device Notifications**: Get notified when images are ready
- **Instant Download**: Download images directly to your device
- **Cyberpunk UI**: Neon red/cyan dark theme
- **Multiple Sizes**: 512x512 and 1024x1024 options
- **Style Selection**: Realistic, artistic, anime, cartoon, fantasy, cyberpunk, vintage

## How to Use

### Local Development
1. Clone the repository
2. Run `python server.py` (requires Python 3.x)
3. Open http://localhost:8000 in your browser
4. Enter a prompt and click "UNLEASH CHAOS"

### Deployment

This app requires a Python backend server to handle API calls. Deploy to:

**Render.com** (Recommended - Free)
1. Push code to GitHub
2. Connect GitHub repo to Render
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `python server.py`
5. Set environment: `PYTHON_VERSION=3.9`

**Heroku**
1. Push code to GitHub
2. Connect to Heroku
3. Add `requirements.txt` with dependencies

**PythonAnywhere**
1. Upload files
2. Run server.py as a web app

## File Structure

```
├── index.html          # Main HTML interface
├── style.css           # Cyberpunk dark theme styling
├── script.js           # Frontend JavaScript
├── server.py           # Python backend (API proxy)
├── requirements.txt    # Python dependencies
├── LICENSE             # CC BY-NC-ND 4.0 License
└── README.md           # This file
```

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Python 3.x HTTP Server
- **Styling**: Vanilla CSS (Cyberpunk Dark Theme)
- **AI API**: Pollinations AI (free, no API key)

## Keyboard Shortcuts

- `Ctrl/Cmd + Enter`: Generate image
- `Escape`: Clear error messages

## Privacy

- No images stored on device (browser localStorage only for gallery)
- No user data collected
- All generation via external APIs
- Images generated on-demand

## License

Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International (CC BY-NC-ND 4.0)

See LICENSE file for full terms.
