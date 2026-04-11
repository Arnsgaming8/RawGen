/**
 * RawGen - AI Image Generator
 * Complete redesign with request queue, exponential backoff, and intelligent state management
 */

const CONFIG = {
    API_ENDPOINT: '/api/pollinations',
    SMART_API_ENDPOINT: '/api/generate-smart',
    STATUS_ENDPOINT: '/api/status',
    MAX_GALLERY_ITEMS: 20,
    STORAGE_KEY: 'rawgen_gallery',
    MAX_RETRIES: 5,
    INITIAL_RETRY_DELAY: 1000,
    MAX_RETRY_DELAY: 30000,
    IMAGE_TIMEOUT: 90000,
    CIRCUIT_BREAKER_TIMEOUT: 60000,
    POLLINATIONS_RATE_LIMIT: 15,
    STYLE_BOOSTERS: {
        realistic: 'photorealistic, 8k resolution, highly detailed',
        artistic: 'artistic, creative, vibrant colors, beautiful composition',
        anime: 'anime style, 2d, cel shaded, vibrant colors, crisp lines',
        cartoon: 'cartoon style, 3d render, vibrant colors, clean lines',
        fantasy: 'fantasy art, magical, ethereal, mystical atmosphere',
        cyberpunk: 'cyberpunk, neon lights, futuristic, sci-fi',
        vintage: 'vintage style, retro, nostalgic, film grain'
    }
};

// ==================== UTILITY CLASSES ====================

class RequestQueue {
    constructor(minInterval) {
        this.minInterval = minInterval * 1000;
        this.lastRequestTime = 0;
        this.pending = [];
        this.processing = false;
    }

    async enqueue(fn) {
        return new Promise((resolve, reject) => {
            this.pending.push({ fn, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.processing || this.pending.length === 0) return;
        this.processing = true;

        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < this.minInterval) {
            await this.sleep(this.minInterval - elapsed);
        }

        const request = this.pending.shift();
        this.lastRequestTime = Date.now();

        try {
            const result = await request.fn();
            request.resolve(result);
        } catch (error) {
            request.reject(error);
        } finally {
            this.processing = false;
            if (this.pending.length > 0) {
                setTimeout(() => this.process(), 0);
            }
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    clear() {
        this.pending = [];
    }
}

class BackoffStrategy {
    constructor(initial, max, maxRetries) {
        this.initial = initial;
        this.max = max;
        this.maxRetries = maxRetries;
        this.attempt = 0;
    }

    next() {
        if (this.attempt >= this.maxRetries) return null;
        const delay = Math.min(
            this.initial * Math.pow(2, this.attempt) + Math.random() * 1000,
            this.max
        );
        this.attempt++;
        return delay;
    }

    reset() {
        this.attempt = 0;
    }
}

class CircuitBreakerMonitor {
    constructor(timeout) {
        this.failures = 0;
        this.lastFailure = null;
        this.timeout = timeout;
        this.state = 'CLOSED';
    }

    recordFailure() {
        this.failures++;
        this.lastFailure = Date.now();
        if (this.failures >= 3) {
            this.state = 'OPEN';
        }
    }

    recordSuccess() {
        if (this.state !== 'CLOSED') {
            this.state = 'CLOSED';
            this.failures = 0;
        }
    }

    canAttempt() {
        if (this.state === 'CLOSED') return true;
        if (this.state === 'OPEN') {
            const elapsed = Date.now() - this.lastFailure;
            if (elapsed > this.timeout) {
                this.state = 'HALF_OPEN';
                return true;
            }
            return false;
        }
        return true;
    }
}

// ==================== MAIN APPLICATION ====================

class RawGenApp {
    constructor() {
        this.elements = this.cacheElements();
        this.state = {
            isGenerating: false,
            currentImageUrl: null,
            loadingInterval: null,
            abortController: null,
            gallery: this.loadGallery(),
            pollinationsAvailable: true
        };

        this.requestQueue = new RequestQueue(CONFIG.POLLINATIONS_RATE_LIMIT);
        this.backoffStrategy = new BackoffStrategy(
            CONFIG.INITIAL_RETRY_DELAY,
            CONFIG.MAX_RETRY_DELAY,
            CONFIG.MAX_RETRIES
        );
        this.circuitBreaker = new CircuitBreakerMonitor(CONFIG.CIRCUIT_BREAKER_TIMEOUT);

        this.init();
    }

    init() {
        this.registerServiceWorker();
        this.bindEvents();
        this.renderGallery();
        this.checkServiceStatus();
        setInterval(() => this.checkServiceStatus(), 60000);
        console.log('RawGen initialized');
    }

    cacheElements() {
        return {
            promptInput: document.getElementById('prompt'),
            styleSelect: document.getElementById('style'),
            generateBtn: document.getElementById('generateBtn'),
            cancelBtn: document.getElementById('cancelBtn'),
            loading: document.getElementById('loadingIndicator'),
            imageLoadingBar: document.getElementById('imageLoadingBar'),
            progressBar: document.querySelector('.loading-bar'),
            progressText: document.querySelector('.loading-percentage'),
            imageContainer: document.getElementById('imageContainer'),
            downloadBtn: document.getElementById('downloadBtn'),
            downloadSection: document.getElementById('downloadSection'),
            errorSection: document.getElementById('errorSection'),
            errorMessage: document.getElementById('errorMessage'),
            gallery: document.getElementById('galleryGrid'),
            clearGalleryBtn: document.getElementById('clearGalleryBtn'),
            sizeSelect: document.getElementById('size')
        };
    }

    async checkServiceStatus() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(CONFIG.STATUS_ENDPOINT, {
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (response.ok) {
                const data = await response.json();
                this.state.pollinationsAvailable = data.pollinations_available;
            }
        } catch (error) {
            console.log('Status check failed:', error.message);
        }
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(reg => console.log('SW registered'))
                .catch(err => console.log('SW failed:', err.message));
        }
    }

    bindEvents() {
        const { generateBtn, downloadBtn, clearGalleryBtn, promptInput } = this.elements;

        promptInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleGenerate();
            }
        });

        generateBtn?.addEventListener('click', () => this.handleGenerate());
        downloadBtn?.addEventListener('click', () => this.downloadImage());
        clearGalleryBtn?.addEventListener('click', () => this.clearGallery());

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.state.isGenerating) {
                this.cancelGeneration();
            }
        });
    }

    async handleGenerate() {
        const promptValue = this.elements.promptInput?.value.trim();
        const style = this.elements.styleSelect?.value || 'realistic';
        const size = this.elements.sizeSelect?.value || '512';

        if (!promptValue) {
            this.showError('Please enter a description for your image.');
            this.elements.promptInput?.focus();
            return;
        }

        if (!this.circuitBreaker.canAttempt()) {
            this.showError('Pollinations is experiencing issues. Please wait 1 minute before trying again.');
            return;
        }

        const available = await this.checkServiceStatus();
        if (!available && !this.circuitBreaker.canAttempt()) {
            this.showError('Pollinations service is unavailable. Please try again later.');
            return;
        }

        this.requestNotificationPermission();
        await this.generateImage(promptValue, style, size);
    }

    cancelGeneration() {
        if (this.state.abortController) {
            this.state.abortController.abort();
            this.state.abortController = null;
        }
        this.requestQueue.clear();
        this.setLoadingState(false);
        this.showError('Generation cancelled by user.', true);
    }

    async generateImage(userPrompt, style, size) {
        if (this.state.isGenerating) return;

        this.state.isGenerating = true;
        this.setLoadingState(true);
        this.hideError();
        this.backoffStrategy.reset();
        this.state.abortController = new AbortController();

        try {
            const response = await this.requestQueue.enqueue(
                () => this.fetchGenerationUrl(userPrompt, style, size)
            );

            if (!response.success) {
                throw new Error(response.error || 'Failed to get generation URL');
            }

            if (response.cached) {
                console.log('Served from cache');
            }

            const urls = [response.imageUrl, ...(response.fallbackUrls || [])];
            let loadedUrl = await this.tryLoadImagesWithRetry(urls, 'Direct');

            if (!loadedUrl && response.proxyUrls) {
                console.log('Direct URLs failed, trying proxy...');
                this.backoffStrategy.reset();
                loadedUrl = await this.tryLoadImagesWithRetry(response.proxyUrls, 'Proxy');
            }

            if (loadedUrl) {
                this.circuitBreaker.recordSuccess();
                this.state.currentImageUrl = loadedUrl;
                await this.displayImage(loadedUrl, userPrompt);
            } else {
                this.circuitBreaker.recordFailure();
                throw new Error(`Unable to generate image after ${CONFIG.MAX_RETRIES} attempts. Pollinations may be down.`);
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Generation cancelled');
                return;
            }
            console.error('Generation failed:', error);
            this.showError(error.message || 'Image generation failed. Please try again.');
        } finally {
            this.state.isGenerating = false;
            this.state.abortController = null;
            this.setLoadingState(false);
        }
    }

    async fetchGenerationUrl(prompt, style, size) {
        const enhancedPrompt = this.enhancePrompt(prompt, style);

        let width = 512, height = 512;
        if (size.includes('x')) {
            [width, height] = size.split('x').map(Number);
        } else {
            width = height = parseInt(size);
        }

        const response = await fetch(CONFIG.SMART_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: enhancedPrompt,
                style,
                width,
                height
            }),
            signal: this.state.abortController?.signal
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        return await response.json();
    }

    enhancePrompt(prompt, style) {
        const booster = CONFIG.STYLE_BOOSTERS[style];
        return booster ? `${prompt}, ${booster}` : prompt;
    }

    async tryLoadImagesWithRetry(urls, sourceType) {
        for (const url of urls) {
            const delay = this.backoffStrategy.next();
            if (delay) {
                console.log(`${sourceType} attempt, waiting ${delay}ms...`);
                await this.sleep(delay);
            }

            try {
                const loaded = await this.loadImageWithTimeout(url, CONFIG.IMAGE_TIMEOUT);
                if (loaded) {
                    console.log(`${sourceType} URL succeeded:`, url.substring(0, 60));
                    return url;
                }
            } catch (error) {
                console.log(`${sourceType} URL failed:`, error.message);
            }
        }
        return null;
    }

    async loadImageWithTimeout(url, timeout) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const timer = setTimeout(() => {
                img.src = '';
                reject(new Error('Image load timeout'));
            }, timeout);

            img.onload = () => {
                clearTimeout(timer);
                resolve(true);
            };

            img.onerror = () => {
                clearTimeout(timer);
                reject(new Error('Image failed to load'));
            };

            img.src = url;
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async displayImage(url, prompt) {
        const { imageContainer, downloadBtn, downloadSection } = this.elements;

        // Clear container and add image
        if (imageContainer) {
            imageContainer.innerHTML = `<img src="${url}" alt="${prompt}" style="max-width: 100%; border-radius: 8px;">`;
            imageContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Show download section
        if (downloadSection) downloadSection.style.display = 'block';

        // Store current URL for download
        this.state.currentImageUrl = url;

        this.addToGallery(url, prompt);
    }

    setLoadingState(isLoading) {
        const { loading, imageLoadingBar, generateBtn, cancelBtn, progressBar, progressText } = this.elements;

        if (isLoading) {
            if (loading) loading.style.display = 'block';
            if (imageLoadingBar) imageLoadingBar.style.display = 'block';
            if (cancelBtn) cancelBtn.style.display = 'inline-block';
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.innerHTML = '<span class="icon">🔥</span> GENERATING...';
            }

            let progress = 0;
            if (progressBar && progressText) {
                this.state.loadingInterval = setInterval(() => {
                    progress = Math.min(progress + 2, 95);
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `${Math.round(progress)}%`;
                }, 1000);
            }
        } else {
            if (loading) loading.style.display = 'none';
            if (imageLoadingBar) imageLoadingBar.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<span class="icon">🔥</span> UNLEASH CHAOS';
            }

            if (this.state.loadingInterval) {
                clearInterval(this.state.loadingInterval);
                this.state.loadingInterval = null;
            }

            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = '100%';
        }
    }

    showError(message, isInfo = false) {
        const { errorSection, errorMessage } = this.elements;
        if (errorMessage) errorMessage.textContent = message;
        if (errorSection) {
            errorSection.style.display = 'block';
            errorSection.classList.toggle('info', isInfo);
            errorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    hideError() {
        const { errorSection } = this.elements;
        if (errorSection) errorSection.style.display = 'none';
    }

    requestNotificationPermission() {
        if ('Notification' in navigator && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    sendNotification(title, options) {
        if ('Notification' in navigator && Notification.permission === 'granted') {
            new Notification(title, options);
        }
    }

    addToGallery(url, prompt) {
        this.state.gallery.unshift({ url, prompt, date: Date.now() });
        if (this.state.gallery.length > CONFIG.MAX_GALLERY_ITEMS) {
            this.state.gallery.pop();
        }
        this.saveGallery();
        this.renderGallery();
    }

    renderGallery() {
        const { gallery } = this.elements;
        if (!gallery) return;

        gallery.innerHTML = this.state.gallery.map(item => `
            <div class="gallery-item" onclick="app.loadGalleryImage('${item.url}', '${item.prompt.replace(/'/g, "\\'")}')">
                <img src="${item.url}" alt="${item.prompt}" loading="lazy">
            </div>
        `).join('');
    }

    loadGalleryImage(url, prompt) {
        const { imageContainer, downloadSection } = this.elements;
        
        if (imageContainer) {
            imageContainer.innerHTML = `<img src="${url}" alt="${prompt}" style="max-width: 100%; border-radius: 8px;">`;
            imageContainer.scrollIntoView({ behavior: 'smooth' });
        }
        
        if (downloadSection) downloadSection.style.display = 'block';
        this.state.currentImageUrl = url;
    }

    clearGallery() {
        this.state.gallery = [];
        this.saveGallery();
        this.renderGallery();
    }

    loadGallery() {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    saveGallery() {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.state.gallery));
    }

    downloadImage() {
        if (this.state.currentImageUrl) {
            const link = document.createElement('a');
            link.href = this.state.currentImageUrl;
            link.download = `rawgen-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}

// Initialize
const app = new RawGenApp();
