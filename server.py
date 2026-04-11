#!/usr/bin/env python3
import http.server
import socketserver
import json
import urllib.parse
import urllib.request
import ssl
import base64
import os
import random

class APIProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.serve_file('index.html')
        elif self.path == '/health':
            self.send_health_check()
        elif self.path == '/style.css':
            self.serve_file('style.css')
        elif self.path == '/script.js':
            self.serve_file('script.js')
        elif self.path == '/sw.js':
            self.serve_file('sw.js')
        elif self.path == '/robots.txt':
            self.serve_file('robots.txt')
        elif self.path == '/sitemap.xml':
            self.serve_file('sitemap.xml')
        else:
            self.send_error(404)
    
    def send_health_check(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(b'OK')
    
    def do_POST(self):
        if self.path.startswith('/api/'):
            self.handle_api_request()
        else:
            self.send_error(404)
    
    def serve_file(self, filename):
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                content = f.read()
            
            content_type = 'text/html'
            if filename.endswith('.css'):
                content_type = 'text/css'
            elif filename.endswith('.js'):
                content_type = 'application/javascript'
            elif filename.endswith('.xml'):
                content_type = 'application/xml'
            elif filename.endswith('.txt'):
                content_type = 'text/plain'
            
            self.send_response(200)
            self.send_header('Content-type', content_type)
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(content.encode())
        except FileNotFoundError:
            self.send_error(404)
        except BrokenPipeError:
            # Client disconnected early (common with health checks)
            pass
    
    def handle_api_request(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                return self.send_json_error(400, 'No data provided')
                
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            api_type = self.path.replace('/api/', '')
            
            if api_type == 'pollinations':
                result = self.handle_pollinations(data)
            else:
                result = {'error': 'Unknown API type'}
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except json.JSONDecodeError as e:
            print(f'JSON decode error: {e}')
            self.send_json_error(400, 'Invalid JSON')
        except Exception as e:
            print(f'API request error: {e}')
            import traceback
            traceback.print_exc()
            self.send_json_error(500, str(e))
    
    def send_json_error(self, code, message):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps({'error': message}).encode())
    
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    
    def handle_pollinations(self, data):
        try:
            prompt = data.get('prompt', '')
            negative = data.get('negative', '')
            width = min(data.get('width', 512), 768)
            height = min(data.get('height', 512), 768)
            
            if not prompt:
                return {'success': False, 'error': 'No prompt provided'}
            
            encoded_prompt = urllib.parse.quote(prompt)
            seed = random.randint(1, 1000000)
            
            image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={width}&height={height}&seed={seed}&nologo=true"
            if negative:
                encoded_negative = urllib.parse.quote(negative)
                image_url += f"&negative={encoded_negative}"
            
            print(f"Generating: {prompt[:50]}...")
            
            for attempt in range(2):
                try:
                    print(f"Attempt {attempt + 1}/2...")
                    context = ssl._create_unverified_context()
                    req = urllib.request.Request(
                        image_url,
                        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                    )
                    
                    timeout = 15
                    
                    with urllib.request.urlopen(req, context=context, timeout=timeout) as response:
                        if response.status == 200:
                            image_data = response.read()
                            image_b64 = base64.b64encode(image_data).decode()
                            print(f"Success! Generated {len(image_data)} bytes")
                            return {
                                'success': True,
                                'imageUrl': f'data:image/png;base64,{image_b64}'
                            }
                        else:
                            print(f"HTTP {response.status}")
                            
                except urllib.error.URLError as e:
                    print(f"Network error: {e}")
                except Exception as e:
                    print(f"Error: {e}")
            
            return {'success': False, 'error': 'Service temporarily unavailable. Please try again.'}
        except Exception as e:
            print(f"CRITICAL ERROR: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': 'Service error. Please try again.'}

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

if __name__ == '__main__':
    PORT = int(os.environ.get('PORT', 8000))
    socketserver.TCPServer.allow_reuse_address = True
    
    print(f'=== RawGen Server Starting ===')
    print(f'Port: {PORT}')
    print(f'Python: Running')
    
    try:
        with socketserver.TCPServer(('', PORT), APIProxyHandler) as httpd:
            print(f'Server bound to port {PORT}')
            print(f'Ready for requests')
            httpd.serve_forever()
    except OSError as e:
        print(f'ERROR: Could not bind to port {PORT}: {e}')
        raise
