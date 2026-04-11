#!/usr/bin/env python3
"""RawGen Server - AI Image Generation API
Complete redesign with queue management, circuit breaker, and intelligent caching
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
import threading
import time
import hashlib
from datetime import datetime, timedelta
from collections import deque
from functools import wraps

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== CONFIGURATION ====================
MAX_IMAGE_SIZE = 1024
DEFAULT_SIZE = 512
MAX_PAYLOAD_SIZE = 10 * 1024  # 10KB max request body

# Pollinations rate limit: 15 seconds between anonymous requests
POLLINATIONS_RATE_LIMIT = 15  # seconds
MAX_QUEUE_SIZE = 50
REQUEST_TIMEOUT = 60

# Circuit breaker config
CIRCUIT_BREAKER_THRESHOLD = 5      # Failures before opening
CIRCUIT_BREAKER_TIMEOUT = 300      # Seconds before trying again (5 min)

# Cache config
CACHE_MAX_SIZE = 100
CACHE_TTL = 3600  # 1 hour

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
        '.txt': 'text/plain',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    }
    
    STYLE_BOOSTERS = {
        'realistic': 'highly detailed, realistic',
        'surreal': 'dreamlike, surreal',
        'abstract': 'abstract, vibrant colors',
        'lowpoly': 'low poly, geometric shapes'
    }
    
    def log_message(self, format, *args):
        """Override to use our logger"""
        logger.info(f"{self.client_address[0]} - {format % args}")
    
    def do_GET(self):
        """Handle GET requests"""
        path = self.path.split('?')[0]
        
        try:
            if path in self.STATIC_FILES:
                self.serve_static(self.STATIC_FILES[path])
            elif path == '/health':
                self.send_json_response({
                    'status': 'healthy',
                    'timestamp': datetime.utcnow().isoformat(),
                    'circuit_breaker': circuit_breaker.state,
                    'cache_size': len(response_cache._cache),
                    'rate_limit_queue': 'active'
                })
            elif path == '/api/status':
                self.send_json_response({
                    'pollinations_available': circuit_breaker.state != 'OPEN',
                    'rate_limit_seconds': POLLINATIONS_RATE_LIMIT,
                    'circuit_breaker_state': circuit_breaker.state
                })
            elif path.startswith('/proxy/image'):
                self.proxy_image()
            else:
                self.send_error(404, 'Not found')
        except Exception as e:
            logger.exception('GET request failed')
            self.send_error(500, str(e))
    
    def do_POST(self):
        """Handle POST requests"""
        try:
            if self.path.startswith('/api/'):
                self.handle_api()
            else:
                self.send_error(404, 'Not found')
        except Exception as e:
            logger.exception('POST request failed')
            self.send_error(500, str(e))
    
    def serve_static(self, filename):
        """Serve static files with proper content types"""
        try:
            # Security: prevent directory traversal
            safe_path = os.path.normpath(filename)
            if '..' in safe_path or safe_path.startswith(os.sep):
                return self.send_error(403, 'Forbidden')
            
            ext = os.path.splitext(safe_path)[1].lower()
            content_type = self.CONTENT_TYPES.get(ext, 'application/octet-stream')
            
            # Check if file exists and is readable
            if not os.path.exists(safe_path) or not os.path.isfile(safe_path):
                return self.send_error(404, 'File not found')
            
            with open(safe_path, 'rb') as f:
                content = f.read()
            
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Cache-Control', 'public, max-age=3600')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(content)
            
        except FileNotFoundError:
            self.send_error(404, 'File not found')
        except PermissionError:
            self.send_error(403, 'Permission denied')
        except BrokenPipeError:
            logger.debug('Client disconnected early')
        except Exception as e:
            logger.error(f'Error serving {filename}: {e}')
            self.send_error(500, 'Internal server error')
    
    def handle_api(self):
        """Handle API endpoints with validation and routing"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                return self.send_json_response({'success': False, 'error': 'No data provided'}, 400)
            
            if content_length > MAX_PAYLOAD_SIZE:
                logger.warning(f'Payload too large: {content_length} bytes')
                return self.send_json_response({'success': False, 'error': 'Request too large'}, 413)
            
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            endpoint = self.path.replace('/api/', '').split('?')[0]
            
            handlers = {
                'pollinations': self.handle_pollinations,
                'generate': self.handle_generate,
                'generate-smart': self.handle_generate_smart
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
        """Legacy endpoint - delegates to smart handler"""
        return self.handle_generate_smart(data)
    
    def handle_generate(self, data):
        """Basic generate - returns URLs only"""
        return self._generate_urls(data)
    
    def handle_generate_smart(self, data):
        """Smart generate with caching and circuit breaker"""
        try:
            prompt = data.get('prompt', '').strip()
            style = data.get('style', 'realistic')
            size = data.get('size', DEFAULT_SIZE)
            skip_cache = data.get('skipCache', False)
            
            # Validation
            if not prompt:
                return {'success': False, 'error': 'Prompt is required'}
            
            if len(prompt) > 500:
                return {'success': False, 'error': 'Prompt too long (max 500 chars)'}
            
            # Check cache first
            if not skip_cache:
                cached = response_cache.get(prompt, style, size)
                if cached:
                    return {**cached, 'cached': True}
            
            # Generate fresh URLs
            result = self._generate_urls(data)
            
            # Store in cache
            if result.get('success'):
                response_cache.set(prompt, style, size, result)
            
            return result
            
        except Exception as e:
            logger.exception('Smart generation error')
            return {'success': False, 'error': str(e)}
    
    def _generate_urls(self, data):
        """Generate Pollinations URLs with multiple fallbacks"""
        prompt = data.get('prompt', '').strip()
        style = data.get('style', 'realistic')
        size = data.get('size', DEFAULT_SIZE)
        
        try:
            width, height = map(int, str(size).split('x'))
        except:
            width = height = int(size)
        
        width = min(max(width, 64), MAX_IMAGE_SIZE)
        height = min(max(height, 64), MAX_IMAGE_SIZE)
        
        # Enhance prompt
        style_boost = self.STYLE_BOOSTERS.get(style, '')
        enhanced = f"{prompt}, {style_boost}" if style_boost else prompt
        encoded = urllib.parse.quote(enhanced)
        
        # Generate multiple URLs with different seeds
        seeds = [random.randint(100000, 999999) for _ in range(3)]
        
        base_urls = [
            f"https://image.pollinations.ai/prompt/{encoded}?width={width}&height={height}&seed={seed}&nologo=true"
            for seed in seeds
        ]
        
        proxy_urls = [
            f"/proxy/image?url={urllib.parse.quote(url)}"
            for url in base_urls
        ]
        
        return {
            'success': True,
            'imageUrl': base_urls[0],
            'fallbackUrls': base_urls[1:],
            'proxyUrls': proxy_urls,
            'meta': {
                'prompt': prompt,
                'style': style,
                'width': width,
                'height': height,
                'seeds': seeds,
                'rateLimitSeconds': POLLINATIONS_RATE_LIMIT
            }
        }

    def proxy_image(self):
        """Proxy image from Pollinations with rate limiting and circuit breaker"""
        try:
            # Parse URL from query string
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            image_url = params.get('url', [''])[0]
            
            # Handle double-encoded URLs
            while '%25' in image_url:
                image_url = urllib.parse.unquote(image_url)
            
            if not image_url or not image_url.startswith('https://image.pollinations.ai/'):
                return self.send_error(400, 'Invalid URL')
            
            logger.info(f'Proxying image: {image_url[:60]}...')
            
            # Wait for rate limit slot
            rate_limit_queue.acquire()
            
            try:
                # Use circuit breaker
                image_data, content_type = circuit_breaker.call(
                    self._fetch_pollinations_image, image_url
                )
                
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Cache-Control', 'public, max-age=300')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(image_data)
                logger.info(f'Proxied {len(image_data)} bytes')
                
            finally:
                rate_limit_queue.release()
                    
        except Exception as e:
            logger.error(f'Proxy error: {e}')
            error_msg = str(e)
            if 'Circuit breaker is OPEN' in error_msg:
                self.send_error(503, 'Pollinations service is currently unavailable')
            else:
                self.send_error(502, 'Failed to proxy image')
    
    def _fetch_pollinations_image(self, image_url):
        """Actually fetch image from Pollinations (called via circuit breaker)"""
        context = ssl._create_unverified_context()
        req = urllib.request.Request(
            image_url,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        
        with urllib.request.urlopen(req, context=context, timeout=REQUEST_TIMEOUT) as response:
            if response.status == 200:
                image_data = response.read()
                content_type = response.headers.get('Content-Type', 'image/png')
                return image_data, content_type
            else:
                raise Exception(f'HTTP {response.status}')


# ==================== CIRCUIT BREAKER ====================
class CircuitBreaker:
    """Prevents cascading failures when Pollinations is down"""
    
    def __init__(self, threshold, timeout):
        self.threshold = threshold
        self.timeout = timeout
        self.failures = 0
        self.last_failure_time = None
        self.state = 'CLOSED'  # CLOSED, OPEN, HALF_OPEN
        self._lock = threading.Lock()
    
    def call(self, func, *args, **kwargs):
        with self._lock:
            if self.state == 'OPEN':
                if time.time() - self.last_failure_time > self.timeout:
                    self.state = 'HALF_OPEN'
                    logger.info('Circuit breaker entering HALF_OPEN state')
                else:
                    raise Exception('Circuit breaker is OPEN - Pollinations appears to be down')
        
        try:
            result = func(*args, **kwargs)
            with self._lock:
                if self.state == 'HALF_OPEN':
                    self.state = 'CLOSED'
                    self.failures = 0
                    logger.info('Circuit breaker CLOSED - service recovered')
            return result
        except Exception as e:
            with self._lock:
                self.failures += 1
                self.last_failure_time = time.time()
                if self.failures >= self.threshold:
                    self.state = 'OPEN'
                    logger.error(f'Circuit breaker OPENED after {self.failures} failures')
            raise e


# ==================== RESPONSE CACHE ====================
class ResponseCache:
    """Simple LRU cache for API responses"""
    
    def __init__(self, max_size, ttl):
        self.max_size = max_size
        self.ttl = ttl
        self._cache = {}
        self._access_times = deque()
        self._lock = threading.Lock()
    
    def _make_key(self, prompt, style, size):
        return hashlib.md5(f"{prompt}:{style}:{size}".encode()).hexdigest()
    
    def get(self, prompt, style, size):
        key = self._make_key(prompt, style, size)
        with self._lock:
            if key in self._cache:
                data, timestamp = self._cache[key]
                if time.time() - timestamp < self.ttl:
                    logger.info(f'Cache HIT for key: {key[:8]}...')
                    return data
                else:
                    del self._cache[key]
        return None
    
    def set(self, prompt, style, size, data):
        key = self._make_key(prompt, style, size)
        with self._lock:
            if len(self._cache) >= self.max_size:
                # Remove oldest
                oldest = self._access_times.popleft()
                self._cache.pop(oldest, None)
            
            self._cache[key] = (data, time.time())
            self._access_times.append(key)


# ==================== REQUEST QUEUE ====================
class RateLimitedQueue:
    """Ensures we respect Pollinations rate limits"""
    
    def __init__(self, min_interval):
        self.min_interval = min_interval
        self.last_request_time = 0
        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)
    
    def acquire(self):
        """Block until it's safe to make a request"""
        with self._condition:
            while True:
                elapsed = time.time() - self.last_request_time
                if elapsed >= self.min_interval:
                    self.last_request_time = time.time()
                    return
                
                wait_time = self.min_interval - elapsed
                logger.info(f'Rate limit: waiting {wait_time:.1f}s')
                self._condition.wait(wait_time)
    
    def release(self):
        """Notify waiting threads"""
        with self._condition:
            self._condition.notify()


# Global instances
circuit_breaker = CircuitBreaker(CIRCUIT_BREAKER_THRESHOLD, CIRCUIT_BREAKER_TIMEOUT)
response_cache = ResponseCache(CACHE_MAX_SIZE, CACHE_TTL)
rate_limit_queue = RateLimitedQueue(POLLINATIONS_RATE_LIMIT)


class ThreadedHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    """Handle requests in separate threads"""
    allow_reuse_address = True
    daemon_threads = True


def run_server(port=8000):
    """Start the server with proper shutdown handling"""
    server = ThreadedHTTPServer(('', port), RawGenHandler)
    logger.info(f' RawGen server running on port {port}')
    logger.info(f' Health check: http://localhost:{port}/health')
    logger.info(f' Status check: http://localhost:{port}/api/status')
    logger.info(f' Circuit breaker: {CIRCUIT_BREAKER_THRESHOLD} failures / {CIRCUIT_BREAKER_TIMEOUT}s timeout')
    logger.info(f' Rate limit: {POLLINATIONS_RATE_LIMIT}s between requests')
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info('\n Server shutting down...')
        server.shutdown()
    except Exception as e:
        logger.error(f'Server error: {e}')
        raise


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    run_server(port)
