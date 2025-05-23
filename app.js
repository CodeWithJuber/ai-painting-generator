// Import API service
import { 
  login, register, getProfile, 
  createTitle, getTitles, getTitle, updateTitle, deleteTitle,
  uploadReference, getReferences, getGlobalReferences, deleteReference,
  generateThumbnails as generatePaintings, getThumbnails as getPaintings
} from './frontend/apiService.js';

// Data Storage
let titles = [];
let globalReferences = [];
let currentTitle = null;
let currentReferenceDataMap = {};
let isLoading = true;
let currentUser = null;
let pollingInterval = null;
let isGenerating = false;

// DOM Elements - will be initialized after DOM loads
let titleList, titleInput, customInstructions, quantitySelect, generateBtn;
let moreThumbnailsBtn, moreThumbnailsSection, thumbnailsGrid, thumbnailsEmptyState;
let progressSection, ai1Progress, ai2Progress, ai1Status, ai2Status;
let newTitleBtn, globalReferenceToggle, globalReferencesSection, titleReferencesSection;
let globalDropzone, titleDropzone, globalFileInput, titleFileInput;
let globalUploadBtn, titleUploadBtn, globalReferenceImages, titleReferenceImages;
let promptModal, closeModal, modalImage, promptSummary, promptTitle;
let promptInstructions, referenceCount, referenceThumbnails, fullPrompt, loadingOverlay;

// Initialize DOM elements with error handling
function initializeDOMElements() {
    try {
        titleList = document.getElementById('title-list');
        titleInput = document.getElementById('title-input');
        customInstructions = document.getElementById('custom-instructions');
        quantitySelect = document.getElementById('quantity-select');
        generateBtn = document.getElementById('generate-btn');
        moreThumbnailsBtn = document.getElementById('more-thumbnails-btn');
        moreThumbnailsSection = document.getElementById('more-thumbnails-section');
        thumbnailsGrid = document.getElementById('thumbnails-grid');
        thumbnailsEmptyState = document.getElementById('thumbnails-empty-state');
        progressSection = document.getElementById('progress-section');
        ai1Progress = document.getElementById('ai1-progress');
        ai2Progress = document.getElementById('ai2-progress');
        ai1Status = document.getElementById('ai1-status');
        ai2Status = document.getElementById('ai2-status');
        newTitleBtn = document.getElementById('new-title-btn');
        globalReferenceToggle = document.getElementById('global-reference-toggle');
        globalReferencesSection = document.getElementById('global-references');
        titleReferencesSection = document.getElementById('title-references');
        globalDropzone = document.getElementById('global-dropzone');
        titleDropzone = document.getElementById('title-dropzone');
        globalFileInput = document.getElementById('global-file-input');
        titleFileInput = document.getElementById('title-file-input');
        globalUploadBtn = document.getElementById('global-upload-btn');
        titleUploadBtn = document.getElementById('title-upload-btn');
        globalReferenceImages = document.getElementById('global-reference-images');
        titleReferenceImages = document.getElementById('title-reference-images');
        promptModal = document.getElementById('prompt-modal');
        closeModal = document.querySelector('.close-modal');
        modalImage = document.getElementById('modal-image');
        promptSummary = document.getElementById('prompt-summary');
        promptTitle = document.getElementById('prompt-title');
        promptInstructions = document.getElementById('prompt-instructions');
        referenceCount = document.getElementById('reference-count');
        referenceThumbnails = document.getElementById('reference-thumbnails');
        fullPrompt = document.getElementById('full-prompt');
        loadingOverlay = document.getElementById('loading-overlay');

        // Validate critical elements
        const criticalElements = [
            { element: titleList, name: 'title-list' },
            { element: titleInput, name: 'title-input' },
            { element: generateBtn, name: 'generate-btn' },
            { element: thumbnailsGrid, name: 'thumbnails-grid' }
        ];

        criticalElements.forEach(({ element, name }) => {
            if (!element) {
                console.error(`Critical DOM element not found: ${name}`);
            }
        });
    } catch (error) {
        console.error('Error initializing DOM elements:', error);
    }
}

// Safe DOM element access with null checks
function safeElementAccess(element, action, ...args) {
    try {
        if (element && typeof action === 'function') {
            return action(element, ...args);
        } else if (element && typeof action === 'string') {
            return element[action];
        }
    } catch (error) {
        console.error('Error accessing DOM element:', error);
    }
    return null;
}

// Initialize the application
async function init() {
    try {
        // Initialize DOM elements first
        initializeDOMElements();
        
        showLoading(true);
        
        // Check if user is already logged in
        const token = localStorage.getItem('authToken');
        if (token) {
            try {
                currentUser = await getProfile();
                if (currentUser) {
                    showMainApp();
                    await loadUserData();
                } else {
                    showLoginForm();
                }
            } catch (error) {
                console.error('Error getting profile:', error);
                localStorage.removeItem('authToken');
                showLoginForm();
            }
        } else {
            showLoginForm();
        }
    } catch (error) {
        console.error('Error during initialization:', error);
        showLoginForm();
    } finally {
        showLoading(false);
    }
}

function showLoading(show) {
    const overlay = loadingOverlay || document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
    isLoading = show;
}

function showMainApp() {
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const usernameDisplay = document.getElementById('username-display');
    
    if (loginContainer) loginContainer.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';
    if (usernameDisplay && currentUser) usernameDisplay.textContent = currentUser.username;
    
    setupEventListeners();
}

async function loadUserData() {
    try {
        showLoading(true);
        
        // Load titles and global references
        titles = await getTitles();
        globalReferences = await getGlobalReferences();
        
        console.log('Loaded titles:', titles.length);
        
        renderTitlesList();
        renderReferenceImages(globalReferences, globalReferenceImages);
        
        // Auto-select the first title if available
        if (!currentTitle && titles.length > 0) {
            console.log('Auto-selecting first title:', titles[0]);
            await loadTitle(titles[0]);
        }
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showError('Failed to load user data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function showError(message) {
    let errorDiv = document.getElementById('error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'error-message';
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
        `;
        document.body.appendChild(errorDiv);
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (errorDiv) errorDiv.style.display = 'none';
    }, 5000);
}

function showLoginForm() {
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    
    if (loginContainer) loginContainer.style.display = 'block';
    if (appContainer) appContainer.style.display = 'none';
    
    // Setup login/register form handlers
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterBtn = document.getElementById('show-register');
    const showLoginBtn = document.getElementById('show-login');
    
    if (loginForm) {
        loginForm.removeEventListener('submit', handleLogin);
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (registerForm) {
        registerForm.removeEventListener('submit', handleRegister);
        registerForm.addEventListener('submit', handleRegister);
    }
    
    if (showRegisterBtn) {
        showRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (loginForm) loginForm.style.display = 'none';
            if (registerForm) registerForm.style.display = 'block';
        });
    }
    
    if (showLoginBtn) {
        showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (registerForm) registerForm.style.display = 'none';
            if (loginForm) loginForm.style.display = 'block';
        });
    }
}

async function handleLogin(event) {
    event.preventDefault();
    
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    
    if (!emailInput || !passwordInput) {
        showError('Login form elements not found');
        return;
    }
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if (!email || !password) {
        showError('Please enter both email and password');
        return;
    }
    
    try {
        const result = await login(email, password);
        if (result.token) {
            localStorage.setItem('authToken', result.token);
            currentUser = result.user;
            showMainApp();
            await loadUserData();
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Login failed: ' + error.message);
    }
}

async function handleRegister(event) {
    event.preventDefault();
    
    const usernameInput = document.getElementById('register-username');
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    
    if (!usernameInput || !emailInput || !passwordInput) {
        showError('Register form elements not found');
        return;
    }
    
    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if (!username || !email || !password) {
        showError('Please fill in all fields');
        return;
    }
    
    if (password.length < 6) {
        showError('Password must be at least 6 characters long');
        return;
    }
    
    try {
        const result = await register(username, email, password);
        if (result.token) {
            localStorage.setItem('authToken', result.token);
            currentUser = result.user;
            showMainApp();
            await loadUserData();
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('Registration failed: ' + error.message);
    }
}

function logout() {
    localStorage.removeItem('authToken');
    currentUser = null;
    currentTitle = null;
    titles = [];
    globalReferences = [];
    stopPolling();
    showLoginForm();
}

function setupEventListeners() {
    try {
        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }
        
        // New title button
        if (newTitleBtn) {
            newTitleBtn.addEventListener('click', () => {
                const title = prompt('Enter a title for your new project:');
                if (title && title.trim()) {
                    createNewTitle(title.trim());
                }
            });
        }
        
        // Generate button with proper event handling
        if (generateBtn) {
            // Remove any existing listeners by cloning the button
            const newGenerateBtn = generateBtn.cloneNode(true);
            generateBtn.parentNode.replaceChild(newGenerateBtn, generateBtn);
            generateBtn = newGenerateBtn;
            
            generateBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                if (isGenerating) {
                    showError('Generation already in progress');
                    return;
                }
                
                if (!currentTitle || !currentTitle.id) {
                    if (titles.length === 0) {
                        const titleText = prompt('No titles found. Please enter a title for your first project:');
                        if (titleText && titleText.trim()) {
                            await createNewTitle(titleText.trim());
                            if (currentTitle && currentTitle.id) {
                                await generatePaintingsWithCurrentTitle();
                            }
                            return;
                        } else {
                            showError('Please create a title first');
                            return;
                        }
                    } else {
                        showError('Please select a title from the sidebar first');
                        return;
                    }
                }
                
                await generatePaintingsWithCurrentTitle();
            });
        }
        
        // Reference image handling
        setupDragAndDrop(globalDropzone, globalReferences, globalReferenceImages, true);
        setupDragAndDrop(titleDropzone, [], titleReferenceImages, false);
        
        // File input handlers
        if (globalUploadBtn && globalFileInput) {
            globalUploadBtn.addEventListener('click', () => globalFileInput.click());
            globalFileInput.addEventListener('change', (e) => {
                handleFileUpload(e, globalReferences, globalReferenceImages, true);
            });
        }
        
        if (titleUploadBtn && titleFileInput) {
            titleUploadBtn.addEventListener('click', () => titleFileInput.click());
            titleFileInput.addEventListener('change', (e) => {
                handleFileUpload(e, [], titleReferenceImages, false);
            });
        }
        
        // Reference toggle
        if (globalReferenceToggle) {
            globalReferenceToggle.addEventListener('change', (e) => {
                if (globalReferencesSection && titleReferencesSection) {
                    if (e.target.checked) {
                        globalReferencesSection.style.display = 'block';
                        titleReferencesSection.style.display = 'none';
                    } else {
                        globalReferencesSection.style.display = 'none';
                        titleReferencesSection.style.display = 'block';
                    }
                }
            });
        }
        
        // More thumbnails button
        if (moreThumbnailsBtn) {
            moreThumbnailsBtn.addEventListener('click', async () => {
                if (!currentTitle || isGenerating) return;
                const quantity = parseInt(quantitySelect?.value || 5);
                await generateServerThumbnails(currentTitle, [], quantity, true);
            });
        }
        
        // Modal close handlers
        if (closeModal) {
            closeModal.addEventListener('click', closePromptModal);
        }
        
        if (promptModal) {
            promptModal.addEventListener('click', (e) => {
                if (e.target.id === 'prompt-modal') {
                    closePromptModal();
                }
            });
        }
        
    } catch (error) {
        console.error('Error setting up event listeners:', error);
    }
}

function setupDragAndDrop(dropzone, referencesArray, displayElement, isGlobal) {
    if (!dropzone) return;
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('drag-over'), false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('drag-over'), false);
    });
    
    dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        handleFiles(files, referencesArray, displayElement, isGlobal);
    }, false);
}

function handleFileUpload(event, referencesArray, displayElement, isGlobal) {
    const files = event.target.files;
    handleFiles(files, referencesArray, displayElement, isGlobal);
    event.target.value = '';
}

async function handleFiles(files, referencesArray, displayElement, isGlobal) {
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    
    for (const file of files) {
        if (!allowedTypes.includes(file.type)) {
            showError(`File ${file.name} is not a supported image type`);
            continue;
        }
        
        if (file.size > maxFileSize) {
            showError(`File ${file.name} is too large (max 10MB)`);
            continue;
        }
        
        try {
            const imageData = await readFileAsDataURL(file);
            const result = await uploadReference(imageData, currentTitle?.id, isGlobal);
            
            if (isGlobal) {
                globalReferences.push(result);
                renderReferenceImages(globalReferences, displayElement);
            } else {
                referencesArray.push(result);
                renderReferenceImages(referencesArray, displayElement);
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            showError('Error uploading file: ' + error.message);
        }
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function renderReferenceImages(references, container) {
    if (!container) return;
    
    container.innerHTML = '';
    
    references.forEach(ref => {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'reference-image-item';
        imgDiv.innerHTML = `
            <img src="${ref.image_data}" alt="Reference" class="reference-image">
            <button class="remove-reference-btn" data-id="${ref.id}">×</button>
        `;
        
        const removeBtn = imgDiv.querySelector('.remove-reference-btn');
        removeBtn.addEventListener('click', () => removeReferenceImage(ref.id, references, container));
        
        container.appendChild(imgDiv);
    });
}

async function removeReferenceImage(id, references, container) {
    try {
        await deleteReference(id);
        const index = references.findIndex(ref => ref.id === id);
        if (index > -1) {
            references.splice(index, 1);
            renderReferenceImages(references, container);
        }
    } catch (error) {
        console.error('Error removing reference:', error);
        showError('Error removing reference: ' + error.message);
    }
}

async function generateServerThumbnails(titleObj, references, quantity, isAdditional) {
    try {
        console.log('generateServerThumbnails called with:', { titleId: titleObj.id, quantity, isAdditional });
        
        // Clear existing thumbnails if not additional
        if (!isAdditional && thumbnailsGrid) {
            thumbnailsGrid.innerHTML = '';
            if (thumbnailsEmptyState) {
                thumbnailsEmptyState.style.display = 'none';
            }
        }
        
        // Start generation
        const result = await generatePaintings(titleObj.id, quantity);
        console.log('generatePaintings API result:', result);
        
        if (result.paintings) {
            result.paintings.forEach((painting, index) => {
                renderThumbnailPlaceholder(painting, index);
            });
            
            startPolling(titleObj.id);
        }
        
        if (moreThumbnailsSection) {
            moreThumbnailsSection.style.display = 'block';
        }
            
    } catch (error) {
        console.error('Error generating thumbnails:', error);
        showError('Error generating paintings: ' + error.message);
        resetGeneratingState();
    }
}

function resetGeneratingState() {
    isGenerating = false;
    if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate Paintings';
    }
    if (moreThumbnailsBtn) {
        moreThumbnailsBtn.disabled = false;
    }
}

function renderThumbnailPlaceholder(painting, index) {
    if (!thumbnailsGrid) return;
    
    const thumbnailDiv = document.createElement('div');
    thumbnailDiv.className = 'thumbnail-item';
    thumbnailDiv.id = `painting-${painting.id}`;
    
    thumbnailDiv.innerHTML = `
        <div class="thumbnail-image-container">
            <div class="thumbnail-placeholder">
                <div class="loading-spinner"></div>
                <div class="status-text">${getStatusText(painting.status)}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${getProgressPercentage(painting.status)}%"></div>
                </div>
            </div>
        </div>
        <div class="thumbnail-info">
            <p class="thumbnail-summary">${painting.summary || 'Generating...'}</p>
            <div class="thumbnail-actions">
                <button class="btn small-btn view-details-btn" disabled>View Details</button>
                <button class="btn small-btn retry-btn" style="display: none;">Retry</button>
            </div>
        </div>
    `;
    
    thumbnailsGrid.appendChild(thumbnailDiv);
}

function getStatusText(status) {
    const statusMap = {
        'creating_prompt': 'Creating prompt...',
        'prompt_ready': 'Prompt ready, generating image...',
        'generating_image': 'Generating image...',
        'completed': 'Completed',
        'failed': 'Failed'
    };
    return statusMap[status] || status;
}

function getProgressPercentage(status) {
    const progressMap = {
        'creating_prompt': 25,
        'prompt_ready': 50,
        'generating_image': 75,
        'completed': 100,
        'failed': 0
    };
    return progressMap[status] || 0;
}

function startPolling(titleId) {
    stopPolling();
    
    console.log(`Starting polling for title ${titleId}`);
    
    pollingInterval = setInterval(async () => {
        try {
            await loadThumbnails(titleId);
        } catch (error) {
            console.error('Error during polling:', error);
        }
    }, 3000);
}

function stopPolling() {
    if (pollingInterval) {
        console.log('Stopping polling');
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

async function loadThumbnails(titleId) {
    try {
        const result = await getPaintings(titleId);
        currentReferenceDataMap = result.referenceDataMap || {};
        
        if (result.paintings) {
            result.paintings.forEach(painting => {
                updateThumbnailDisplay(painting);
            });
            
            const allDone = result.paintings.every(p => 
                p.status === 'completed' || p.status === 'failed'
            );
            
            if (allDone) {
                stopPolling();
                resetGeneratingState();
            }
        }
    } catch (error) {
        console.error('Error loading thumbnails:', error);
    }
}

function updateThumbnailDisplay(painting) {
    const thumbnailElement = document.getElementById(`painting-${painting.id}`);
    if (!thumbnailElement) return;
    
    const imageContainer = thumbnailElement.querySelector('.thumbnail-image-container');
    const summaryElement = thumbnailElement.querySelector('.thumbnail-summary');
    const viewDetailsBtn = thumbnailElement.querySelector('.view-details-btn');
    const retryBtn = thumbnailElement.querySelector('.retry-btn');
    
    if (summaryElement) {
        summaryElement.textContent = painting.summary || 'Generated painting';
    }
    
    if (painting.status === 'completed' && painting.image_data && imageContainer) {
        imageContainer.innerHTML = `
            <img src="${painting.image_data}" alt="Generated Painting" class="thumbnail-image" loading="lazy">
        `;
        
        if (viewDetailsBtn) {
            viewDetailsBtn.disabled = false;
            viewDetailsBtn.onclick = () => showPromptDetails(painting);
        }
        if (retryBtn) {
            retryBtn.style.display = 'none';
        }
        
    } else if (painting.status === 'failed' && imageContainer) {
        imageContainer.innerHTML = `
            <div class="thumbnail-error">
                <div class="error-icon">⚠️</div>
                <div class="error-text">Generation failed</div>
                <div class="error-message">${painting.error_message || 'Unknown error'}</div>
            </div>
        `;
        
        if (retryBtn) {
            retryBtn.style.display = 'inline-block';
            retryBtn.onclick = () => retryGeneration(painting.id);
        }
        if (viewDetailsBtn) {
            viewDetailsBtn.disabled = true;
        }
        
    } else if (imageContainer) {
        imageContainer.innerHTML = `
            <div class="thumbnail-placeholder">
                <div class="loading-spinner"></div>
                <div class="status-text">${getStatusText(painting.status)}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${getProgressPercentage(painting.status)}%"></div>
                </div>
            </div>
        `;
        
        if (viewDetailsBtn) viewDetailsBtn.disabled = true;
        if (retryBtn) retryBtn.style.display = 'none';
    }
}

async function retryGeneration(paintingId) {
    try {
        await regeneratePainting(paintingId);
        showError('Regeneration started');
        if (currentTitle) {
            startPolling(currentTitle.id);
        }
    } catch (error) {
        console.error('Error retrying generation:', error);
        showError('Error retrying generation: ' + error.message);
    }
}

function showPromptDetails(painting) {
    if (!promptModal) return;
    
    try {
        // Debug logging
        console.log('Showing prompt details for painting:', painting);
        
        // Set image
        if (modalImage) {
            modalImage.src = painting.image_data || painting.image_url || '';
        }
        
        // Set summary
        if (promptSummary) {
            promptSummary.textContent = painting.summary || 'No summary available';
        }
        
        // Set title and instructions from current title
        if (promptTitle) {
            promptTitle.textContent = currentTitle?.title || 'Unknown Title';
        }
        
        if (promptInstructions) {
            promptInstructions.textContent = currentTitle?.instructions || 'No custom instructions';
        }
        
        // Handle reference images
        let referenceImages = [];
        let refCount = 0;
        
        // Try to get reference data from different sources
        if (painting.promptDetails && painting.promptDetails.referenceImages) {
            referenceImages = painting.promptDetails.referenceImages;
            refCount = painting.promptDetails.referenceCount || referenceImages.length;
        } else if (currentReferenceDataMap[painting.id]) {
            referenceImages = currentReferenceDataMap[painting.id];
            refCount = referenceImages.length;
        }
        
        if (referenceCount) {
            referenceCount.textContent = refCount;
        }
        
        if (referenceThumbnails) {
            referenceThumbnails.innerHTML = '';
            referenceImages.forEach(ref => {
                const img = document.createElement('img');
                img.src = ref.image_data || ref;
                img.className = 'reference-thumbnail';
                img.style.cssText = 'width: 50px; height: 50px; object-fit: cover; margin: 2px; border-radius: 4px;';
                referenceThumbnails.appendChild(img);
            });
        }
        
        // Get full prompt from multiple possible sources
        let fullPromptText = 'Prompt not available';
        
        if (painting.promptDetails && painting.promptDetails.fullPrompt) {
            fullPromptText = painting.promptDetails.fullPrompt;
        } else if (painting.fullPrompt) {
            fullPromptText = painting.fullPrompt;
        } else if (painting.full_prompt) {
            fullPromptText = painting.full_prompt;
        }
        
        console.log('Final full prompt text:', fullPromptText);
        
        if (fullPrompt) {
            fullPrompt.textContent = fullPromptText;
        }
        
        // Show the modal
        promptModal.style.display = 'block';
        
    } catch (error) {
        console.error('Error showing prompt details:', error);
        showError('Error displaying prompt details: ' + error.message);
    }
}

function closePromptModal() {
    if (promptModal) {
        promptModal.style.display = 'none';
    }
}

function renderTitlesList() {
    if (!titleList) return;
    
    titleList.innerHTML = '';
    
    if (titles.length === 0) {
        titleList.innerHTML = '<div class="empty-state">No titles yet. Create your first one!</div>';
        return;
    }
    
    titles.forEach(title => {
        const titleDiv = document.createElement('div');
        titleDiv.className = 'title-item';
        if (currentTitle && currentTitle.id === title.id) {
            titleDiv.classList.add('active');
        }
        
        titleDiv.innerHTML = `
            <div class="title-text">${title.title}</div>
            <div class="title-actions">
                <button class="btn small-btn delete-btn">Delete</button>
            </div>
        `;
        
        titleDiv.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-btn')) {
                loadTitle(title);
            }
        });
        
        const deleteBtn = titleDiv.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTitleConfirm(title.id);
        });
        
        titleList.appendChild(titleDiv);
    });
}

async function loadTitle(title) {
    try {
        if (!title || !title.id) {
            console.error('Invalid title object:', title);
            showError('Invalid title data');
            return;
        }
        
        currentTitle = title;
        
        if (titleInput) titleInput.value = title.title || '';
        if (customInstructions) customInstructions.value = title.instructions || '';
        
        // Update active title in sidebar
        document.querySelectorAll('.title-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const titleItems = document.querySelectorAll('.title-item');
        titleItems.forEach(item => {
            const titleTextElement = item.querySelector('.title-text');
            if (titleTextElement && titleTextElement.textContent === title.title) {
                item.classList.add('active');
            }
        });
        
        await loadThumbnails(title.id);
        
        const result = await getPaintings(title.id);
        if (result.paintings) {
            const hasActiveGenerations = result.paintings.some(p => 
                p.status !== 'completed' && p.status !== 'failed'
            );
            
            if (hasActiveGenerations) {
                isGenerating = true;
                if (generateBtn) {
                    generateBtn.disabled = true;
                    generateBtn.textContent = 'Generating...';
                }
                if (moreThumbnailsBtn) {
                    moreThumbnailsBtn.disabled = true;
                }
                startPolling(title.id);
            }
            
            if (thumbnailsGrid) {
                thumbnailsGrid.innerHTML = '';
            }
            
            if (result.paintings.length > 0) {
                if (thumbnailsEmptyState) {
                    thumbnailsEmptyState.style.display = 'none';
                }
                
                result.paintings.forEach((painting, index) => {
                    if (painting.status === 'completed') {
                        renderCompletedThumbnail(painting, index);
                    } else {
                        renderThumbnailPlaceholder(painting, index);
                    }
                });
                
                if (moreThumbnailsSection) {
                    moreThumbnailsSection.style.display = 'block';
                }
            } else {
                if (thumbnailsEmptyState) {
                    thumbnailsEmptyState.style.display = 'block';
                }
                if (moreThumbnailsSection) {
                    moreThumbnailsSection.style.display = 'none';
                }
            }
        }
        
    } catch (error) {
        console.error('Error loading title:', error);
        showError('Error loading title: ' + error.message);
    }
}

function renderCompletedThumbnail(painting, index) {
    if (!thumbnailsGrid) return;
    
    const thumbnailDiv = document.createElement('div');
    thumbnailDiv.className = 'thumbnail-item';
    thumbnailDiv.id = `painting-${painting.id}`;
    
    thumbnailDiv.innerHTML = `
        <div class="thumbnail-image-container">
            <img src="${painting.image_data || painting.image_url}" alt="Generated Painting" class="thumbnail-image" loading="lazy">
        </div>
        <div class="thumbnail-info">
            <p class="thumbnail-summary">${painting.summary || 'Generated painting'}</p>
            <div class="thumbnail-actions">
                <button class="btn small-btn view-details-btn">View Details</button>
                <button class="btn small-btn retry-btn" style="display: none;">Retry</button>
            </div>
        </div>
    `;
    
    const viewDetailsBtn = thumbnailDiv.querySelector('.view-details-btn');
    if (viewDetailsBtn) {
        viewDetailsBtn.addEventListener('click', () => showPromptDetails(painting));
    }
    
    thumbnailsGrid.appendChild(thumbnailDiv);
}

async function createNewTitle(titleText) {
    try {
        console.log('Creating new title with text:', titleText);
        
        const newTitle = await createTitle(titleText, '');
        
        console.log('API response for createTitle:', newTitle);
        console.log('newTitle.id:', newTitle?.id);
        console.log('Type of newTitle:', typeof newTitle);
        
        if (!newTitle) {
            console.error('createTitle returned null/undefined');
            showError('Failed to create title: No response from server');
            return;
        }
        
        if (!newTitle.id) {
            console.error('createTitle response missing id:', newTitle);
            showError('Failed to create title: Invalid response from server');
            return;
        }
        
        console.log('Title created successfully:', newTitle);
        titles.unshift(newTitle);
        renderTitlesList();
        await loadTitle(newTitle);
    } catch (error) {
        console.error('Error creating title:', error);
        showError('Error creating title: ' + error.message);
    }
}

async function deleteTitleConfirm(titleId) {
    if (!confirm('Are you sure you want to delete this title and all its paintings?')) {
        return;
    }
    
    try {
        await deleteTitle(titleId);
        titles = titles.filter(t => t.id !== titleId);
        
        if (currentTitle && currentTitle.id === titleId) {
            currentTitle = null;
            
            if (titleInput) titleInput.value = '';
            if (customInstructions) customInstructions.value = '';
            if (thumbnailsGrid) thumbnailsGrid.innerHTML = '';
            if (thumbnailsEmptyState) thumbnailsEmptyState.style.display = 'block';
            if (moreThumbnailsSection) moreThumbnailsSection.style.display = 'none';
            
            stopPolling();
            resetGeneratingState();
        }
        
        renderTitlesList();
    } catch (error) {
        console.error('Error deleting title:', error);
        showError('Error deleting title: ' + error.message);
    }
}

async function generatePaintingsWithCurrentTitle() {
    if (isGenerating) {
        console.log('Generation already in progress, skipping');
        return;
    }
    
    if (!titleInput || !customInstructions || !quantitySelect) {
        showError('Form elements not found');
        return;
    }
    
    const titleText = titleInput.value.trim();
    const instructions = customInstructions.value.trim();
    const quantity = parseInt(quantitySelect.value);
    
    if (!titleText) {
        showError('Please enter a title');
        return;
    }
    
    if (quantity < 1 || quantity > 10) {
        showError('Quantity must be between 1 and 10');
        return;
    }
    
    if (!currentTitle || !currentTitle.id) {
        showError('Invalid title selected. Please select a title from the sidebar.');
        return;
    }
    
    isGenerating = true;
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
    }
    if (moreThumbnailsBtn) {
        moreThumbnailsBtn.disabled = true;
    }
    
    try {
        await updateTitle(currentTitle.id, titleText, instructions);
        currentTitle.title = titleText;
        currentTitle.instructions = instructions;
        
        await generateServerThumbnails(currentTitle, [], quantity, false);
    } catch (error) {
        console.error('Error updating title or generating paintings:', error);
        showError('Error: ' + error.message);
        resetGeneratingState();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Cleanup polling when page is unloaded
window.addEventListener('beforeunload', () => {
    stopPolling();
});

// Handle visibility change to pause/resume polling
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentTitle && isGenerating && !pollingInterval) {
        console.log('Page visible, resuming polling');
        startPolling(currentTitle.id);
    }
}); 