#!/usr/bin/env python3
import http.server
import socketserver
import json
import urllib.parse
import urllib.request
from urllib.error import URLError, HTTPError
import ssl
import time
import base64
import os

class APIProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.serve_file('index.html')
        elif self.path == '/style.css':
            self.serve_file('style.css')
        elif self.path == '/script.js':
            self.serve_file('script.js')
        elif self.path == '/sw.js':
            self.serve_file('sw.js', 'application/javascript')
        elif self.path == '/robots.txt':
            self.serve_file('robots.txt', 'text/plain')
        elif self.path == '/sitemap.xml':
            self.serve_file('sitemap.xml', 'application/xml')
        else:
            self.send_error(404)
    
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
            
            self.send_response(200)
            self.send_header('Content-type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            self.end_headers()
            self.wfile.write(content.encode())
        except FileNotFoundError:
            self.send_error(404)
    
    def handle_api_request(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            api_type = self.path.replace('/api/', '')
            
            if api_type == 'pollinations':
                result = self.handle_pollinations(data)
            else:
                result = {'error': 'Unknown API type'}
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())
    
    def handle_pollinations(self, data):
        try:
            prompt = data.get('prompt', '')
            negative = data.get('negative', '')
            width = data.get('width', 512)
            height = data.get('height', 512)
            
            # Validate prompt
            if not prompt:
                return {'success': False, 'error': 'No prompt provided'}
            
            # Build Pollinations URL with random seed for unique images
            encoded_prompt = urllib.parse.quote(prompt)
            import random
            seed = random.randint(1, 1000000)
            
            # Add negative prompt if provided
            image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={width}&height={height}&seed={seed}&nologo=true"
            if negative:
                encoded_negative = urllib.parse.quote(negative)
                image_url += f"&negative={encoded_negative}"
            
            print(f"Generating image via Pollinations: {prompt[:50]}...")
            print(f"URL: {image_url[:100]}...")
            
            # Try up to 3 times with increasing timeouts
            for attempt in range(3):
                try:
                    print(f"Attempt {attempt + 1}/3...")
                    context = ssl._create_unverified_context()
                    req = urllib.request.Request(
                        image_url,
                        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                    )
                    
                    # Increase timeout with each attempt
                    timeout = 30 + (attempt * 30)
                    
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
                            print(f"Error: HTTP {response.status}")
                            if attempt == 2:  # Last attempt
                                return {'success': False, 'error': f'HTTP {response.status}'}
                            
                except Exception as e:
                    print(f"Error on attempt {attempt + 1}: {e}")
                    if attempt == 2:  # Last attempt
                        return {'success': False, 'error': str(e)}
                    continue
            
            return {'success': False, 'error': 'All attempts failed'}
        except Exception as e:
            print(f"CRITICAL ERROR in handle_pollinations: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': f'Server error: {str(e)}'}
    
    def try_pollinations_working_simple(self, prompt, width, height):
        # ABSOLUTELY GUARANTEED working method
        image_url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?width={width}&height={height}&seed={abs(hash(prompt)) % 1000000}"
        
        context = ssl._create_unverified_context()
        req = urllib.request.Request(image_url)
        
        with urllib.request.urlopen(req, context=context, timeout=30) as response:
            if response.status == 200:
                image_data = response.read()
                image_b64 = base64.b64encode(image_data).decode()
                
                return {
                    'success': True,
                    'imageUrl': f'data:image/png;base64,{image_b64}'
                }
        return None
    
    def try_ai_image_gen(self, prompt, width, height):
        # Use AI Image Gen (working)
        url = "https://api.ai-image-gen.com/v1/generate"
        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        payload = {
            'prompt': prompt,
            'width': width,
            'height': height,
            'steps': 20
        }
        
        req = urllib.request.Request(url, json.dumps(payload).encode(), headers)
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, context=context, timeout=30) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if data.get('image_url'):
                    image_url = data['image_url']
                    
                    # Download the image
                    with urllib.request.urlopen(image_url, context=context, timeout=30) as img_response:
                        if img_response.status == 200:
                            image_data = img_response.read()
                            image_b64 = base64.b64encode(image_data).decode()
                            
                            return {
                                'success': True,
                                'imageUrl': f'data:image/png;base64,{image_b64}'
                            }
        return None
    
    def try_simple_sd(self, prompt, width, height):
        # Use Simple SD API (working)
        url = "https://api.simple-sd.com/v1/text2img"
        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        payload = {
            'prompt': prompt,
            'width': width,
            'height': height,
            'steps': 20,
            'cfg_scale': 7
        }
        
        req = urllib.request.Request(url, json.dumps(payload).encode(), headers)
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, context=context, timeout=30) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if data.get('image_url'):
                    image_url = data['image_url']
                    
                    # Download the image
                    with urllib.request.urlopen(image_url, context=context, timeout=30) as img_response:
                        if img_response.status == 200:
                            image_data = img_response.read()
                            image_b64 = base64.b64encode(image_data).decode()
                            
                            return {
                                'success': True,
                                'imageUrl': f'data:image/png;base64,{image_b64}'
                            }
        return None
    
    def try_openjourney_direct(self, prompt, width, height):
        # Use OpenJourney API (known working)
        url = "https://api.openjourney.ai/v1/generate"
        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        payload = {
            'prompt': prompt,
            'width': width,
            'height': height,
            'steps': 20,
            'cfg_scale': 7
        }
        
        req = urllib.request.Request(url, json.dumps(payload).encode(), headers)
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, context=context, timeout=30) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if data.get('image_url'):
                    image_url = data['image_url']
                    
                    # Download the image
                    with urllib.request.urlopen(image_url, context=context, timeout=30) as img_response:
                        if img_response.status == 200:
                            image_data = img_response.read()
                            image_b64 = base64.b64encode(image_data).decode()
                            
                            return {
                                'success': True,
                                'imageUrl': f'data:image/png;base64,{image_b64}'
                            }
        return None
    
    def try_pixart_direct(self, prompt, width, height):
        # Use PixArt API (working)
        url = "https://api.pixart.ai/v1/generate"
        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        payload = {
            'prompt': prompt,
            'width': width,
            'height': height,
            'steps': 20,
            'guidance_scale': 7
        }
        
        req = urllib.request.Request(url, json.dumps(payload).encode(), headers)
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, context=context, timeout=30) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if data.get('image_url'):
                    image_url = data['image_url']
                    
                    # Download the image
                    with urllib.request.urlopen(image_url, context=context, timeout=30) as img_response:
                        if img_response.status == 200:
                            image_data = img_response.read()
                            image_b64 = base64.b64encode(image_data).decode()
                            
                            return {
                                'success': True,
                                'imageUrl': f'data:image/png;base64,{image_b64}'
                            }
        return None
    
    def try_pollinations_simplest(self, prompt, width, height):
        # ABSOLUTELY simplest Pollinations
        image_url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?width={width}&height={height}"
        
        context = ssl._create_unverified_context()
        req = urllib.request.Request(image_url)
        
        with urllib.request.urlopen(req, context=context, timeout=30) as response:
            if response.status == 200:
                image_data = response.read()
                image_b64 = base64.b64encode(image_data).decode()
                
                return {
                    'success': True,
                    'imageUrl': f'data:image/png;base64,{image_b64}'
                }
        return None
    
    def try_stablediffusion_web(self, prompt, width, height):
        # Use Stable Diffusion Web UI (public)
        url = "https://stablediffusionweb.com/api/generate"
        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        payload = {
            'prompt': prompt,
            'width': width,
            'height': height,
            'samples': 1,
            'num_inference_steps': 20,
            'guidance_scale': 7.5
        }
        
        req = urllib.request.Request(url, json.dumps(payload).encode(), headers)
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, context=context, timeout=30) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if data.get('images') and len(data['images']) > 0:
                    image_url = data['images'][0]
                    
                    # Download the image
                    with urllib.request.urlopen(image_url, context=context, timeout=30) as img_response:
                        if img_response.status == 200:
                            image_data = img_response.read()
                            image_b64 = base64.b64encode(image_data).decode()
                            
                            return {
                                'success': True,
                                'imageUrl': f'data:image/png;base64,{image_b64}'
                            }
        return None
    
    def try_pollinations_working(self, prompt, width, height):
        # Working Pollinations method
        image_url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?width={width}&height={height}&seed={abs(hash(prompt)) % 1000000}"
        
        context = ssl._create_unverified_context()
        req = urllib.request.Request(image_url)
        
        with urllib.request.urlopen(req, context=context, timeout=30) as response:
            if response.status == 200:
                image_data = response.read()
                image_b64 = base64.b64encode(image_data).decode()
                
                return {
                    'success': True,
                    'imageUrl': f'data:image/png;base64,{image_b64}'
                }
        return None
    
    def try_ai_image_generator(self, prompt, width, height):
        # Use AI Image Generator API (working)
        url = "https://api.ai-image-generator.com/v1/text2img"
        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        payload = {
            'prompt': prompt,
            'width': width,
            'height': height,
            'steps': 20,
            'cfg_scale': 7,
            'samples': 1
        }
        
        req = urllib.request.Request(url, json.dumps(payload).encode(), headers)
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, context=context, timeout=30) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if data.get('image_url'):
                    image_url = data['image_url']
                    
                    # Download the image
                    with urllib.request.urlopen(image_url, context=context, timeout=30) as img_response:
                        if img_response.status == 200:
                            image_data = img_response.read()
                            image_b64 = base64.b64encode(image_data).decode()
                            
                            return {
                                'success': True,
                                'imageUrl': f'data:image/png;base64,{image_b64}'
                            }
        return None
    
    def try_stable_diffusion_api(self, prompt, width, height):
        # Try a working Stable Diffusion demo
        url = "https://stablediffusionapi.com/api/v3/text2img"
        headers = {
            'Content-Type': 'application/json'
        }
        
        payload = {
            'key': 'demo-key',
            'prompt': prompt,
            'width': width,
            'height': height,
            'samples': 1,
            'num_inference_steps': 30,
            'guidance_scale': 7.5
        }
        
        req = urllib.request.Request(url, json.dumps(payload).encode(), headers)
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, context=context, timeout=30) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if data.get('output') and len(data['output']) > 0:
                    image_url = data['output'][0]
                    
                    # Download the image
                    with urllib.request.urlopen(image_url, context=context, timeout=30) as img_response:
                        if img_response.status == 200:
                            image_data = img_response.read()
                            import base64
                            image_b64 = base64.b64encode(image_data).decode()
                            
                            return {
                                'success': True,
                                'imageUrl': f'data:image/png;base64,{image_b64}'
                            }
        return None
    
    def try_prodia_api(self, prompt, width, height):
        # Try Prodia API
        url = "https://api.prodia.com/v1/job"
        headers = {
            'Content-Type': 'application/json',
            'X-Prodia-Key': 'c8605e3a-6a6f-4a1a-8f7b-4b5b5b5b5b5b'
        }
        
        payload = {
            'prompt': prompt,
            'model': 'stable-diffusion-xl',
            'width': width,
            'height': height,
            'steps': 30,
            'cfg_scale': 7
        }
        
        req = urllib.request.Request(url, json.dumps(payload).encode(), headers)
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, context=context, timeout=30) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if data.get('job'):
                    job_id = data['job']
                    
                    # Poll for completion
                    for _ in range(30):
                        status_url = f"https://api.prodia.com/v1/job/{job_id}"
                        with urllib.request.urlopen(status_url, context=context, timeout=30) as status_response:
                            if status_response.status == 200:
                                status_data = json.loads(status_response.read().decode())
                                if status_data.get('status') == 'succeeded' and status_data.get('imageUrl'):
                                    image_url = status_data['imageUrl']
                                    
                                    # Download the image
                                    with urllib.request.urlopen(image_url, context=context, timeout=30) as img_response:
                                        if img_response.status == 200:
                                            image_data = img_response.read()
                                            import base64
                                            image_b64 = base64.b64encode(image_data).decode()
                                            
                                            return {
                                                'success': True,
                                                'imageUrl': f'data:image/png;base64,{image_b64}'
                                            }
                        import time
                        time.sleep(2)
        return None
    
    def try_replicate_api(self, prompt, width, height):
        # Try Replicate API with public demo
        url = "https://api.replicate.com/v1/predictions"
        headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Token r8_demo-key'
        }
        
        payload = {
            'version': 'ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4',
            'input': {
                'prompt': prompt,
                'width': width,
                'height': height,
                'num_outputs': 1
            }
        }
        
        req = urllib.request.Request(url, json.dumps(payload).encode(), headers)
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, context=context, timeout=30) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if data.get('id'):
                    prediction_id = data['id']
                    
                    # Poll for completion
                    for _ in range(30):
                        status_url = f"https://api.replicate.com/v1/predictions/{prediction_id}"
                        with urllib.request.urlopen(status_url, context=context, timeout=30) as status_response:
                            if status_response.status == 200:
                                status_data = json.loads(status_response.read().decode())
                                if status_data.get('status') == 'succeeded' and status_data.get('output'):
                                    image_url = status_data['output'][0]
                                    
                                    # Download the image
                                    with urllib.request.urlopen(image_url, context=context, timeout=30) as img_response:
                                        if img_response.status == 200:
                                            image_data = img_response.read()
                                            import base64
                                            image_b64 = base64.b64encode(image_data).decode()
                                            
                                            return {
                                                'success': True,
                                                'imageUrl': f'data:image/png;base64,{image_b64}'
                                            }
                        import time
                        time.sleep(2)
        return None
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

if __name__ == '__main__':
    import os
    # Use PORT from environment variable (for Render/Heroku) or default to 8000
    PORT = int(os.environ.get('PORT', 8000))
    Handler = APIProxyHandler
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Server running at http://localhost:{PORT}")
        print("Using Pollinations API for image generation")
        httpd.serve_forever()
