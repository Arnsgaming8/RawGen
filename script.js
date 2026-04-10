/**
 * RawGen - AI Image Generator
 * Clean, modular ES6+ architecture
 */

// Configuration
const CONFIG = {
    API_ENDPOINT: '/api/pollinations',
    MAX_GALLERY_ITEMS: 20,
    STORAGE_KEY: 'rawgen_gallery',
    STYLE_BOOSTERS: {
        realistic: 'photorealistic, 8k resolution',
        artistic: 'artistic, creative, vibrant colors, beautiful composition',
        anime: 'anime style, 2d, cel shaded, vibrant colors, crisp lines',
        cartoon: 'cartoon style, 3d render, vibrant colors, clean lines',
        fantasy: 'fantasy art, magical, ethereal, mystical atmosphere',
        cyberpunk: 'cyberpunk, neon lights, futuristic, sci-fi',
        vintage: 'vintage style, retro, nostalgic, film grain'
    }
};

class AIImageGenerator {
    constructor() {
        this.elements = this.getElements();
        this.state = {
            currentImageUrl: null,
            generatedImages: [],
            abortController: null,
            loadingInterval: null
        };
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.loadGallery();
    }

    getElements() {
        return {
            form: document.getElementById('imageForm'),
            prompt: document.getElementById('prompt'),
            style: document.getElementById('style'),
            size: document.getElementById('size'),
            generateBtn: document.getElementById('generateBtn'),
            imageContainer: document.getElementById('imageContainer'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            downloadSection: document.getElementById('downloadSection'),
            downloadBtn: document.getElementById('downloadBtn'),
            errorSection: document.getElementById('errorSection'),
            errorMessage: document.getElementById('errorMessage'),
            galleryGrid: document.getElementById('galleryGrid'),
            clearGalleryBtn: document.getElementById('clearGalleryBtn'),
            cancelBtn: document.getElementById('cancelBtn'),
            loadingBar: document.getElementById('imageLoadingBar')
        };
    }

    bindEvents() {
        const { form, downloadBtn, cancelBtn, clearGalleryBtn } = this.elements;
        
        form.addEventListener('submit', (e) => this.handleSubmit(e));
        downloadBtn.addEventListener('click', () => this.downloadImage());
        cancelBtn?.addEventListener('click', () => this.cancelGeneration());
        clearGalleryBtn?.addEventListener('click', () => this.clearGallery());
    }
    
    cancelGeneration() {
        if (this.state.abortController) {
            this.state.abortController.abort();
            this.state.abortController = null;
        }
        this.setLoadingState(false);
        this.showError('Generation cancelled by user.');
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        const { prompt, style, size } = this.elements;
        const promptValue = prompt.value.trim();
        
        if (!promptValue) {
            this.showError('Please enter a description for your image.');
            return;
        }

        this.requestNotificationPermission();
        await this.generateImage(promptValue, style.value, size.value);
    }

    async generateImage(userPrompt, style, size) {
        this.setLoadingState(true);
        this.hideError();
        
        this.state.abortController = new AbortController();

        try {
            const imageUrl = await this.generateWithPollinations(userPrompt, style, size);
            if (imageUrl) {
                this.displayImage(imageUrl, userPrompt);
                this.state.currentImageUrl = imageUrl;
                return;
            }
        } catch (error) {
            if (error.name === 'AbortError' || this.state.abortController?.signal.aborted) {
                console.log('Generation cancelled');
                return;
            }
            console.log('Generation failed:', error.message);
            this.showError('Image generation failed. Please try again.');
        } finally {
            this.state.abortController = null;
            this.setLoadingState(false);
        }
    }

    enhancePrompt(prompt, style) {
        let enhanced = prompt;
        
        if (style && CONFIG.STYLE_BOOSTERS[style]) {
            enhanced += `, ${CONFIG.STYLE_BOOSTERS[style]}`;
        }
        
        // Anatomy fixers for people/creatures
        const needsAnatomy = /person|people|man|woman|girl|boy|face|body|hand|human|creature|character|anime/i.test(prompt);
        if (needsAnatomy) {
            enhanced += ', correct anatomy, proper proportions';
        }
        
        return `${enhanced}, best quality, highly detailed`;
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
        const { imageContainer, downloadSection, prompt } = this.elements;
        
        imageContainer.innerHTML = `
            <img src="${imageUrl}" alt="Generated AI Image" class="generated-image" 
                style="max-width: 100%; max-height: 500px; object-fit: contain;">
        `;
        downloadSection.classList.remove('hidden');
        this.setLoadingState(false);
        
        // Save to gallery with original user prompt
        const userPrompt = originalPrompt || prompt.value.trim();
        this.addToGallery(imageUrl, userPrompt);
        
        this.showDeviceNotification('Image Generated!', 'Your creation is ready!');
    }
    
    addToGallery(imageUrl, prompt) {
        this.state.generatedImages.unshift({
            url: imageUrl,
            prompt: prompt,
            timestamp: Date.now()
        });
        
        // Keep only max items
        if (this.state.generatedImages.length > CONFIG.MAX_GALLERY_ITEMS) {
            this.state.generatedImages = this.state.generatedImages.slice(0, CONFIG.MAX_GALLERY_ITEMS);
        }
        
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.state.generatedImages));
        this.renderGallery();
    }
    
    loadGallery() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (saved) {
            try {
                this.state.generatedImages = JSON.parse(saved);
                this.renderGallery();
            } catch (e) {
                console.error('Failed to load gallery:', e);
            }
        }
    }
    
    renderGallery() {
        const galleryContainer = document.getElementById('galleryGrid');
        if (!galleryContainer) return;
        
        if (this.state.generatedImages.length === 0) {
            galleryContainer.innerHTML = '<p class="gallery-empty">No images yet. Generate your first image!</p>';
            return;
        }
        
        const newContainer = galleryContainer.cloneNode(false);
        galleryContainer.parentNode.replaceChild(newContainer, galleryContainer);
        this.elements.galleryGrid = newContainer;
        
        newContainer.innerHTML = this.state.generatedImages.map((img, index) => `
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
        const img = this.state.generatedImages[index];
        if (img) {
            const { imageContainer, downloadSection, prompt } = this.elements;
            this.state.currentImageUrl = img.url;
            imageContainer.innerHTML = `<img src="${img.url}" alt="Generated AI Image" class="generated-image">`;
            downloadSection.classList.remove('hidden');
            prompt.value = img.prompt;
        }
    }
    
    downloadGalleryImage(index) {
        const img = this.state.generatedImages[index];
        if (!img) return;
        
        const link = document.createElement('a');
        link.href = img.url;
        link.download = `rawgen-${index}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    deleteGalleryImage(index) {
        this.state.generatedImages.splice(index, 1);
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.state.generatedImages));
        this.renderGallery();
    }
    
    clearGallery() {
        if (confirm('Clear all generated images? This cannot be undone.')) {
            this.state.generatedImages = [];
            localStorage.removeItem(CONFIG.STORAGE_KEY);
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
        const options = { body, tag: 'ai-gen', silent: false };
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
        const { currentImageUrl } = this.state;
        if (!currentImageUrl) {
            this.showError('No image available to download.');
            return;
        }

        const link = document.createElement('a');
        
        if (currentImageUrl.startsWith('data:')) {
            link.href = currentImageUrl;
            link.download = `rawgen-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            fetch(currentImageUrl)
                .then(r => r.blob())
                .then(blob => {
                    const url = URL.createObjectURL(blob);
                    link.href = url;
                    link.download = `rawgen-${Date.now()}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                })
                .catch(() => this.showError('Failed to download image. Try right-clicking instead.'));
        }
    }

    setLoadingState(isLoading) {
        const { generateBtn, imageContainer, loadingIndicator, downloadSection, cancelBtn, loadingBar } = this.elements;
        
        generateBtn.disabled = isLoading;
        
        if (isLoading) {
            generateBtn.innerHTML = '<span class="icon">⏳</span> GENERATING...';
            imageContainer.classList.add('hidden');
            loadingIndicator.classList.remove('hidden');
            downloadSection.classList.add('hidden');
            if (loadingBar) loadingBar.style.display = 'block';
            if (cancelBtn) cancelBtn.style.display = 'inline-flex';
            this.startLoadingAnimation();
        } else {
            generateBtn.innerHTML = '<span class="icon">🔥</span> UNLEASH CHAOS';
            imageContainer.classList.remove('hidden');
            loadingIndicator.classList.add('hidden');
            if (loadingBar) loadingBar.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'none';
            this.stopLoadingAnimation();
        }
    }
    
    startLoadingAnimation() {
        const percentageEls = document.querySelectorAll('.loading-percentage');
        if (percentageEls.length === 0) return;
        
        let percentage = 0;
        this.state.loadingInterval = setInterval(() => {
            percentage += Math.random() * 2 + 0.5;
            if (percentage >= 95) {
                percentage = 95;
                clearInterval(this.state.loadingInterval);
                this.state.loadingInterval = null;
            }
            percentageEls.forEach(el => el.textContent = Math.floor(percentage) + '%');
        }, 150);
    }
    
    stopLoadingAnimation() {
        if (this.state.loadingInterval) {
            clearInterval(this.state.loadingInterval);
            this.state.loadingInterval = null;
        }
        // Set all percentages to 100% when complete
        const percentageEls = document.querySelectorAll('.loading-percentage');
        percentageEls.forEach(el => {
            el.textContent = '100%';
        });
    }

    showError(message) {
        const { errorMessage, errorSection } = this.elements;
        errorMessage.textContent = message;
        errorSection.classList.remove('hidden');
    }

    hideError() {
        this.elements.errorSection.classList.add('hidden');
    }

    async generateWithPollinations(prompt, style, size) {
        const enhancedPrompt = this.enhancePrompt(prompt, style);
        const [width, height] = size.split('x');
        
        const response = await fetch(CONFIG.API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: enhancedPrompt,
                width: parseInt(width),
                height: parseInt(height)
            }),
            signal: this.state.abortController?.signal
        });

        if (!response.ok) throw new Error('Server error');
        
        const data = await response.json();
        if (data.success && data.imageUrl) return data.imageUrl;
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
