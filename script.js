class AIImageGenerator {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.currentImageUrl = null;
        this.generatedImages = []; // Store generated images for gallery
        this.abortController = null; // For canceling generation
        this.apiEndpoints = [
            'https://image.pollinations.ai/prompt/',
            'https://api.deepai.org/api/text2img',
            'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image'
        ];
        this.currentApiIndex = 0;
    }

    initializeElements() {
        this.form = document.getElementById('imageForm');
        this.promptInput = document.getElementById('prompt');
        this.styleSelect = document.getElementById('style');
        this.sizeSelect = document.getElementById('size');
        this.generateBtn = document.getElementById('generateBtn');
        this.imageContainer = document.getElementById('imageContainer');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.downloadSection = document.getElementById('downloadSection');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.errorSection = document.getElementById('errorSection');
        this.errorMessage = document.getElementById('errorMessage');
        this.galleryGrid = document.getElementById('galleryGrid');
        this.clearGalleryBtn = document.getElementById('clearGalleryBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.imageLoadingBar = document.getElementById('imageLoadingBar');
        
        // Load saved gallery on init
        this.loadGallery();
    }

    bindEvents() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.downloadBtn.addEventListener('click', () => this.downloadImage());
        
        // Cancel generation button
        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', () => this.cancelGeneration());
        }
        
        // Clear gallery button
        if (this.clearGalleryBtn) {
            this.clearGalleryBtn.addEventListener('click', () => this.clearGallery());
        }
    }
    
    cancelGeneration() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.setLoadingState(false);
        this.showError('Generation cancelled by user.');
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        const prompt = this.promptInput.value.trim();
        const style = this.styleSelect.value;
        const size = this.sizeSelect.value;

        if (!prompt) {
            this.showError('Please enter a description for your image.');
            return;
        }

        // Request notification permission on first generation
        this.requestNotificationPermission();

        await this.generateImage(prompt, style, size);
    }

    async generateImage(userPrompt, style, size) {
        this.setLoadingState(true);
        this.hideError();
        
        // Store original user prompt for display
        const originalPrompt = userPrompt;
        
        // Create new abort controller for this generation
        this.abortController = new AbortController();

        // Use Puter.js first (SDK method), then direct REST API, then fallback to server-side methods
        const methods = [
            () => this.generateWithPuter(userPrompt, style, size),
            () => this.generateWithPuterDirect(userPrompt, style, size),
            () => this.generateWithLocalProxy(userPrompt, style, size),
            () => this.generateWithHuggingFaceProxy(userPrompt, style, size)
        ];

        for (const method of methods) {
            try {
                const imageUrl = await method();
                if (imageUrl) {
                    this.displayImage(imageUrl, originalPrompt);
                    this.currentImageUrl = imageUrl;
                    this.abortController = null;
                    return;
                }
            } catch (error) {
                // Check if aborted
                if (error.name === 'AbortError' || this.abortController?.signal.aborted) {
                    console.log('Generation was cancelled');
                    this.abortController = null;
                    return; // Don't show error, already handled in cancelGeneration
                }
                const errorMsg = error?.message || error?.toString() || 'Unknown error';
                console.log('API method failed, trying next:', errorMsg);
                continue;
            }
        }

        // Only show error if not aborted
        if (!this.abortController?.signal.aborted) {
            this.showError('All generation methods failed. Please try again.');
        }
        this.abortController = null;
        this.setLoadingState(false);
    }

    enhancePrompt(prompt, style) {
        // Style-specific prompt boosters for all image styles
        const styleBoosters = {
            realistic: 'photorealistic, 8k resolution',
            artistic: 'artistic, creative, vibrant colors, beautiful composition, trending on artstation',
            anime: 'anime style, 2d, cel shaded, vibrant colors, crisp lines',
            cartoon: 'cartoon style, 3d render, vibrant colors, clean lines',
            fantasy: 'fantasy art, magical, ethereal, mystical atmosphere, dramatic lighting',
            cyberpunk: 'cyberpunk, neon lights, futuristic, sci-fi, high tech',
            vintage: 'vintage style, retro, nostalgic, film grain, classic photography'
        };

        let enhanced = prompt;

        // Add style booster if style is selected
        if (style && styleBoosters[style]) {
            enhanced = `${enhanced}, ${styleBoosters[style]}`;
        }

        // Add anatomy fixers for people/creatures to prevent distortion
        const lowerPrompt = prompt.toLowerCase();
        const needsAnatomyFix = /person|people|man|woman|girl|boy|face|body|hand|human|creature|character|anime/g.test(lowerPrompt);
        if (needsAnatomyFix) {
            enhanced = `${enhanced}, correct anatomy, proper proportions`;
        }

        // Add quality boosters
        enhanced = `${enhanced}, best quality, highly detailed`;

        return enhanced;
    }

    preloadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        });
    }

    displayImage(imageUrl, originalPrompt = '') {
        this.imageContainer.innerHTML = `
            <img src="${imageUrl}" alt="Generated AI Image" class="generated-image" 
                style="width: auto !important; height: auto !important; max-width: 100% !important; max-height: 500px !important; object-fit: contain !important;">
        `;
        this.downloadSection.classList.remove('hidden');
        this.setLoadingState(false);
        
        // Save to gallery with original user prompt (not enhanced)
        const userPrompt = originalPrompt || this.promptInput.value.trim();
        this.addToGallery(imageUrl, userPrompt);
        
        // Show device notification
        this.showDeviceNotification('Image Generated!', 'Your chaotic creation is ready 🔥');
    }
    
    addToGallery(imageUrl, prompt) {
        // Add to beginning of array (newest first)
        this.generatedImages.unshift({
            url: imageUrl,
            prompt: prompt,
            timestamp: Date.now()
        });
        
        // Keep only last 20 images
        if (this.generatedImages.length > 20) {
            this.generatedImages = this.generatedImages.slice(0, 20);
        }
        
        // Save to localStorage
        localStorage.setItem('unrestrictedGallery', JSON.stringify(this.generatedImages));
        
        // Render gallery
        this.renderGallery();
    }
    
    loadGallery() {
        // Load from localStorage
        const saved = localStorage.getItem('unrestrictedGallery');
        if (saved) {
            try {
                this.generatedImages = JSON.parse(saved);
                this.renderGallery();
            } catch (e) {
                console.error('Failed to load gallery:', e);
            }
        }
    }
    
    renderGallery() {
        const galleryContainer = document.getElementById('galleryGrid');
        if (!galleryContainer) return;
        
        if (this.generatedImages.length === 0) {
            galleryContainer.innerHTML = '<p class="gallery-empty">No images yet. Generate your first chaos!</p>';
            return;
        }
        
        // Remove old event listeners by cloning and replacing the container
        const newContainer = galleryContainer.cloneNode(false);
        galleryContainer.parentNode.replaceChild(newContainer, galleryContainer);
        this.galleryGrid = newContainer;
        
        newContainer.innerHTML = this.generatedImages.map((img, index) => `
            <div class="gallery-item" data-index="${index}">
                <img src="${img.url}" alt="${img.prompt.substring(0, 50)}..." loading="lazy">
                <div class="gallery-overlay">
                    <p class="gallery-prompt">${img.prompt.substring(0, 60)}${img.prompt.length > 60 ? '...' : ''}</p>
                    <div class="gallery-overlay-buttons">
                        <button class="gallery-download" data-index="${index}" title="Download">⬇️</button>
                        <button class="gallery-delete" data-index="${index}" title="Delete">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
        
        // Use event delegation for gallery items
        newContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            const item = e.target.closest('.gallery-item');
            
            if (btn) {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                if (btn.classList.contains('gallery-download')) {
                    this.downloadGalleryImage(index);
                } else if (btn.classList.contains('gallery-delete')) {
                    this.deleteGalleryImage(index);
                }
            } else if (item) {
                const index = parseInt(item.dataset.index);
                this.loadImageFromGallery(index);
            }
        });
    }
    
    loadImageFromGallery(index) {
        const img = this.generatedImages[index];
        if (img) {
            this.currentImageUrl = img.url;
            this.imageContainer.innerHTML = `
                <img src="${img.url}" alt="Generated AI Image" class="generated-image">
            `;
            this.downloadSection.classList.remove('hidden');
            this.promptInput.value = img.prompt;
        }
    }
    
    downloadGalleryImage(index) {
        const img = this.generatedImages[index];
        if (!img) return;
        
        const link = document.createElement('a');
        link.href = img.url;
        link.download = `chaos-creation-${index}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    deleteGalleryImage(index) {
        this.generatedImages.splice(index, 1);
        localStorage.setItem('unrestrictedGallery', JSON.stringify(this.generatedImages));
        this.renderGallery();
    }
    
    clearGallery() {
        if (confirm('Clear all generated images? This cannot be undone.')) {
            this.generatedImages = [];
            localStorage.removeItem('unrestrictedGallery');
            this.renderGallery();
        }
    }
    
    showDeviceNotification(title, body) {
        // Check if browser supports notifications
        if ('Notification' in window) {
            // Request permission if not already granted
            if (Notification.permission === 'granted') {
                // Show notification
                new Notification(title, {
                    body: body,
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔥</text></svg>',
                    badge: '🔥',
                    tag: 'ai-generation',
                    requireInteraction: false
                });
            } else if (Notification.permission !== 'denied') {
                // Request permission
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification(title, {
                            body: body,
                            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔥</text></svg>',
                            badge: '🔥',
                            tag: 'ai-generation',
                            requireInteraction: false
                        });
                    }
                });
            }
        }
    }
    
    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    downloadImage() {
        if (!this.currentImageUrl) {
            this.showError('No image available to download.');
            return;
        }

        const link = document.createElement('a');
        
        // If it's a base64 data URL, download directly
        if (this.currentImageUrl.startsWith('data:')) {
            link.href = this.currentImageUrl;
            link.download = `ai-image-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            // For regular URLs, fetch and download
            fetch(this.currentImageUrl)
                .then(response => response.blob())
                .then(blob => {
                    const url = URL.createObjectURL(blob);
                    link.href = url;
                    link.download = `ai-image-${Date.now()}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                })
                .catch(error => {
                    console.error('Error downloading image:', error);
                    this.showError('Failed to download image. Try right-clicking the image instead.');
                });
        }
    }

    setLoadingState(isLoading) {
        this.generateBtn.disabled = isLoading;
        
        if (isLoading) {
            this.generateBtn.innerHTML = '<span class="icon">⏳</span> GENERATING...';
            this.imageContainer.classList.add('hidden');
            this.loadingIndicator.classList.remove('hidden');
            this.downloadSection.classList.add('hidden');
            // Show image loading bar
            if (this.imageLoadingBar) {
                this.imageLoadingBar.style.display = 'block';
            }
            // Show cancel button
            if (this.cancelBtn) {
                this.cancelBtn.style.display = 'inline-flex';
            }
            // Start loading percentage animation
            this.startLoadingAnimation();
        } else {
            this.generateBtn.innerHTML = '<span class="icon">🔥</span> UNLEASH CHAOS';
            this.imageContainer.classList.remove('hidden');
            this.loadingIndicator.classList.add('hidden');
            // Hide image loading bar
            if (this.imageLoadingBar) {
                this.imageLoadingBar.style.display = 'none';
            }
            // Hide cancel button
            if (this.cancelBtn) {
                this.cancelBtn.style.display = 'none';
            }
            // Stop loading animation
            this.stopLoadingAnimation();
        }
    }
    
    startLoadingAnimation() {
        const percentageEls = document.querySelectorAll('.loading-percentage');
        if (percentageEls.length === 0) return;
        
        let percentage = 0;
        this.loadingInterval = setInterval(() => {
            // Increment with consistent speed
            const increment = Math.random() * 2 + 0.5;
            percentage += increment;
            
            // Cap at 95% until actually complete
            if (percentage >= 95) {
                percentage = 95;
                clearInterval(this.loadingInterval);
                this.loadingInterval = null;
            }
            
            percentageEls.forEach(el => {
                el.textContent = Math.floor(percentage) + '%';
            });
        }, 150);
    }
    
    stopLoadingAnimation() {
        if (this.loadingInterval) {
            clearInterval(this.loadingInterval);
            this.loadingInterval = null;
        }
        // Set all percentages to 100% when complete
        const percentageEls = document.querySelectorAll('.loading-percentage');
        percentageEls.forEach(el => {
            el.textContent = '100%';
        });
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorSection.classList.remove('hidden');
    }

    hideError() {
        this.errorSection.classList.add('hidden');
    }

    async generateWithLocalProxy(prompt, style, size) {
        const enhancedPrompt = this.enhancePrompt(prompt, style);
        const [width, height] = size.split('x');
        
        // Use class abortController for both timeout and cancel
        const timeoutId = setTimeout(() => this.abortController?.abort(), 90000); // 90 second timeout
        
        try {
            // Use local server proxy for Pollinations
            const response = await fetch('/api/pollinations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: enhancedPrompt,
                    width: parseInt(width),
                    height: parseInt(height)
                }),
                signal: this.abortController?.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error('Local proxy error');
            }

            const data = await response.json();
            if (data.success && data.imageUrl) {
                // Image is already base64 encoded, no need to preload
                return data.imageUrl;
            }
            throw new Error('No image returned from proxy');
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                // Check if it was user-cancelled or timeout
                if (this.abortController?.signal.aborted) {
                    throw error; // Re-throw to handle in generateImage
                }
                throw new Error('Request timed out. The generation is taking too long.');
            }
            throw error;
        }
    }

    async generateWithPuter(prompt, style, size) {
        const enhancedPrompt = this.enhancePrompt(prompt, style);
        const [width, height] = size.split('x');

        // Use class abortController for both timeout and cancel
        const timeoutId = setTimeout(() => this.abortController?.abort(), 90000); // 90 second timeout

        try {
            // Check if Puter.js is available and initialized
            if (typeof puter === 'undefined' || !puter) {
                throw new Error('Puter.js not loaded');
            }

            // Check if Puter.ai is available
            if (!puter.ai || typeof puter.ai.txt2img !== 'function') {
                throw new Error('Puter.ai not available');
            }

            // Try Together AI provider first (has disable_safety_checker option)
            // Uses FLUX.1-schnell which is fast and unrestricted
            const imageElement = await puter.ai.txt2img(enhancedPrompt, {
                provider: 'together',
                model: 'black-forest-labs/FLUX.1-schnell',
                width: parseInt(width),
                height: parseInt(height),
                disable_safety_checker: true,
                steps: 4, // Fast generation
                n: 1
            });

            clearTimeout(timeoutId);

            if (imageElement && imageElement.src) {
                // Convert to base64 for consistency
                const response = await fetch(imageElement.src);
                const blob = await response.blob();
                const reader = new FileReader();

                return new Promise((resolve, reject) => {
                    reader.onloadend = () => {
                        resolve(reader.result);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            }
            throw new Error('No image returned from Puter.js');
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                // Check if it was user-cancelled or timeout
                if (this.abortController?.signal.aborted) {
                    throw error; // Re-throw to handle in generateImage
                }
                throw new Error('Request timed out. The generation is taking too long.');
            }
            throw error;
        }
    }

    // Fallback: Direct REST API call to Puter to bypass WebSocket issues
    async generateWithPuterDirect(prompt, style, size) {
        const enhancedPrompt = this.enhancePrompt(prompt, style);
        const [width, height] = size.split('x');

        const timeoutId = setTimeout(() => this.abortController?.abort(), 90000);

        try {
            // Direct API call to Puter's driver API (bypasses WebSocket issues)
            const response = await fetch('https://api.puter.com/drivers/call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    interface: 'puter-ai',
                    method: 'txt2img',
                    args: {
                        prompt: enhancedPrompt,
                        provider: 'together',
                        model: 'black-forest-labs/FLUX.1-schnell',
                        width: parseInt(width),
                        height: parseInt(height),
                        disable_safety_checker: true,
                        steps: 4,
                        n: 1
                    }
                }),
                signal: this.abortController?.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Puter API error: ${response.status}`);
            }

            const data = await response.json();

            // The API returns a result with the image
            if (data?.result?.image_url || data?.result?.url) {
                const imageUrl = data.result.image_url || data.result.url;
                // Fetch and convert to base64
                const imgResponse = await fetch(imageUrl);
                const blob = await imgResponse.blob();
                const reader = new FileReader();

                return new Promise((resolve, reject) => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            }

            throw new Error('No image URL in Puter response');
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                if (this.abortController?.signal.aborted) {
                    throw error;
                }
                throw new Error('Request timed out');
            }
            throw error;
        }
    }

    async generateWithHuggingFaceProxy(prompt, style, size) {
        const enhancedPrompt = this.enhancePrompt(prompt, style);
        const [width, height] = size.split('x');
        
        // Use class abortController for both timeout and cancel
        const timeoutId = setTimeout(() => this.abortController?.abort(), 90000); // 90 second timeout
        
        try {
            // Use HuggingFace through local proxy
            const response = await fetch('/api/huggingface', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: enhancedPrompt,
                    width: parseInt(width),
                    height: parseInt(height)
                }),
                signal: this.abortController?.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error('HuggingFace proxy error');
            }

            const data = await response.json();
            if (data.success && data.imageUrl) {
                // Image is already base64 encoded, no need to preload
                return data.imageUrl;
            }
            throw new Error('No image returned from HuggingFace');
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                // Check if it was user-cancelled or timeout
                if (this.abortController?.signal.aborted) {
                    throw error; // Re-throw to handle in generateImage
                }
                throw new Error('Request timed out. The generation is taking too long.');
            }
            throw error;
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AIImageGenerator();
});

// Add some keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to generate image
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const form = document.getElementById('imageForm');
        if (form) {
            form.dispatchEvent(new Event('submit'));
        }
    }
    
    // Escape to clear error
    if (e.key === 'Escape') {
        const errorSection = document.getElementById('errorSection');
        if (errorSection && !errorSection.classList.contains('hidden')) {
            errorSection.classList.add('hidden');
        }
    }
});
