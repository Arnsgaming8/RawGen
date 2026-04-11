#!/usr/bin/env python3
"""RawGen Server - AI Image Generation API
Clean, robust architecture with proper error handling
"""
import http.server
import socketserver
import json
import urllib.parse
import urllib.request
import ssl
import os
import random
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
MAX_IMAGE_SIZE = 1024
DEFAULT_SIZE = 512

class RawGenHandler(http.server.SimpleHTTPRequestHandler):
    """Main request handler with clean separation of concerns"""
    
    # Static file mappings
    STATIC_FILES = {
        '/': 'index.html',
        '/index.html': 'index.html',
        '/style.css': 'style.css',
        '/script.js': 'script.js',
        '/sw.js': 'sw.js',
        '/robots.txt': 'robots.txt',
        '/sitemap.xml': 'sitemap.xml'
    }
    
    CONTENT_TYPES = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.xml': 'application/xml',
        '.txt': 'text/plain'
    }
    
    def do_GET(self):
        """Handle GET requests"""
        if self.path in self.STATIC_FILES:
            self.serve_static(self.STATIC_FILES[self.path])
        elif self.path == '/health':
            self.send_json_response({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})
        elif self.path.startswith('/proxy/image'):
            self.proxy_image()
        else:
            self.send_error(404, 'Not found')
    
    def do_POST(self):
        """Handle POST requests"""
        if self.path.startswith('/api/'):
            self.handle_api()
        else:
            self.send_error(404, 'Not found')
    
    def serve_static(self, filename):
        """Serve static files with proper content types"""
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                content = f.read()
            
            ext = os.path.splitext(filename)[1]
            content_type = self.CONTENT_TYPES.get(ext, 'text/plain')
            
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(content.encode())
            logger.info(f'Served: {filename}')
            
        except FileNotFoundError:
            logger.error(f'File not found: {filename}')
            self.send_error(404, 'File not found')
        except BrokenPipeError:
            logger.debug('Client disconnected early')
    
    def handle_api(self):
        """Handle API endpoints"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                return self.send_json_response({'success': False, 'error': 'No data provided'}, 400)
            
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            endpoint = self.path.replace('/api/', '')
            
            handlers = {
                'pollinations': self.handle_pollinations,
                'generate': self.handle_generate
            }
            
            handler = handlers.get(endpoint)
            if handler:
                result = handler(data)
            else:
                result = {'success': False, 'error': f'Unknown endpoint: {endpoint}'}
            
            status = 200 if result.get('success') else 500
            self.send_json_response(result, status)
            
        except json.JSONDecodeError:
            logger.error('Invalid JSON received')
            self.send_json_response({'success': False, 'error': 'Invalid JSON'}, 400)
        except Exception as e:
            logger.exception('API error')
            self.send_json_response({'success': False, 'error': 'Internal server error'}, 500)
    
    def send_json_response(self, data, status=200):
        """Send JSON response with proper headers"""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def send_cors_headers(self):
        """Add CORS headers for cross-origin requests"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    def handle_pollinations(self, data):
        """Legacy endpoint - returns Pollinations URL"""
        return self._generate_pollinations_url(data)
    
    def handle_generate(self, data):
        """New endpoint with better error handling"""
        return self._generate_pollinations_url(data)
    
    def _generate_pollinations_url(self, data):
        """Generate Pollinations URL with validation"""
        try:
            prompt = data.get('prompt', '').strip()
            negative = data.get('negative', '').strip()
            width = min(max(data.get('width', DEFAULT_SIZE), 64), MAX_IMAGE_SIZE)
            height = min(max(data.get('height', DEFAULT_SIZE), 64), MAX_IMAGE_SIZE)
            
            if not prompt:
                return {'success': False, 'error': 'No prompt provided'}
            
            if len(prompt) > 1000:
                return {'success': False, 'error': 'Prompt too long (max 1000 chars)'}
            
            # Generate multiple seed options for client retry
            seeds = [random.randint(1, 1000000) for _ in range(3)]
            encoded_prompt = urllib.parse.quote(prompt)
            
            urls = []
            proxy_urls = []
            for seed in seeds:
                url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={width}&height={height}&seed={seed}&nologo=true"
                if negative:
                    url += f"&negative={urllib.parse.quote(negative)}"
                urls.append(url)
                # Proxy URL as ultimate fallback
                proxy_urls.append(f"/proxy/image?url={urllib.parse.quote(url)}")
            
            logger.info(f'Generated URLs for: {prompt[:50]}...')
            
            return {
                'success': True,
                'imageUrl': urls[0],  # Primary URL
                'fallbackUrls': urls[1:],  # Backup URLs with different seeds
                'proxyUrls': proxy_urls,  # Server-side proxy fallbacks
                'meta': {
                    'prompt': prompt[:100],
                    'width': width,
                    'height': height,
                    'seeds': seeds
                }
            }
            
        except Exception as e:
            logger.exception('Generation error')
            return {'success': False, 'error': 'Failed to generate image URL'}

    def proxy_image(self):
        """Proxy image from Pollinations (fallback when direct loading fails)"""
        try:
            # Parse URL from query string
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            image_url = params.get('url', [''])[0]
            
            if not image_url or not image_url.startswith('https://image.pollinations.ai/'):
                return self.send_error(400, 'Invalid URL')
            
            logger.info(f'Proxying image: {image_url[:60]}...')
            
            # Fetch from Pollinations
            context = ssl._create_unverified_context()
            req = urllib.request.Request(
                image_url,
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            )
            
            with urllib.request.urlopen(req, context=context, timeout=45) as response:
                if response.status == 200:
                    image_data = response.read()
                    content_type = response.headers.get('Content-Type', 'image/png')
                    
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Cache-Control', 'public, max-age=300')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(image_data)
                    logger.info(f'Proxied {len(image_data)} bytes')
                else:
                    self.send_error(502, f'Upstream error: {response.status}')
                    
        except urllib.error.HTTPError as e:
            logger.error(f'Pollinations HTTP error: {e.code}')
            self.send_error(502, f'Image service error: {e.code}')
        except Exception as e:
            logger.exception('Proxy error')
            self.send_error(502, 'Failed to proxy image')

    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()
    
    def log_message(self, format, *args):
        """Override to use proper logging"""
        logger.info(f"{self.client_address[0]} - {format % args}")


def run_server():
    """Start the server"""
    port = int(os.environ.get('PORT', 8000))
    socketserver.TCPServer.allow_reuse_address = True
    
    logger.info('=== RawGen Server Starting ===')
    logger.info(f'Port: {port}')
    
    try:
        with socketserver.TCPServer(('', port), RawGenHandler) as httpd:
            logger.info(f'Server ready on port {port}')
            httpd.serve_forever()
    except OSError as e:
        logger.error(f'Failed to bind port {port}: {e}')
        raise


if __name__ == '__main__':
    run_server()
