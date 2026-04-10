class AIImageGenerator {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.currentImageUrl = null;
        this.generatedImages = []; // Store generated images for gallery
        this.abortController = null; // For canceling generation
        // Using Pollinations for image generation (fast, free, no API key)
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

        // Use Pollinations for image generation
        try {
            const imageUrl = await this.generateWithPollinations(userPrompt, style, size);
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
                return;
            }
            const errorMsg = error?.message || error?.toString() || 'Unknown error';
            console.log('Pollinations failed:', errorMsg);
            this.showError('Image generation failed. Please try again.');
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
        // Vibration works on all mobile devices
        if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
        
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS || !('Notification' in window)) {
            this.showInAppNotification(title, body);
            return;
        }
        
        if (Notification.permission === 'granted') {
            this.sendNotification(title, body);
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(p => {
                p === 'granted' ? this.sendNotification(title, body) : this.showInAppNotification(title, body);
            });
        } else {
            this.showInAppNotification(title, body);
        }
    }
    
    sendNotification(title, body) {
        const options = { body, icon: '🔥', badge: '🔥', tag: 'ai-gen', silent: false };
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(r => r.showNotification(title, options)).catch(() => new Notification(title, options));
        } else {
            new Notification(title, options);
        }
    }
    
    showInAppNotification(title, body) {
        // Fallback toast notification for iOS/blocked
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#ff0040;color:white;padding:15px;border-radius:8px;z-index:9999;animation:slideIn 0.3s;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        toast.innerHTML = `<strong>${title}</strong><br>${body}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }
    
    requestNotificationPermission() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (!isIOS && 'Notification' in window && Notification.permission === 'default') {
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

    async generateWithPollinations(prompt, style, size) {
        const enhancedPrompt = this.enhancePrompt(prompt, style);
        const [width, height] = size.split('x');
        
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

        if (!response.ok) {
            throw new Error('Server error');
        }

        const data = await response.json();
        if (data.success && data.imageUrl) {
            return data.imageUrl;
        }
        throw new Error(data.error || 'No image returned');
    }

}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AIImageGenerator();
    
    // Register service worker for mobile notifications
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.log('SW failed:', err.message));
    }
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
