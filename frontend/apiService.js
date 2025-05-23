// Simple API service for same-origin requests
const API_BASE_URL = '/api';

// Helper function to make API requests with better error handling
const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('authToken');
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  };
  
  const finalOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers
    }
  };
  
  try {
    console.log(`Making API request to: ${API_BASE_URL}${endpoint}`);
    const response = await fetch(`${API_BASE_URL}${endpoint}`, finalOptions);
    
    // Handle different response types
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    console.log(`API response for ${endpoint}:`, data);
    
    if (!response.ok) {
      // Handle specific error cases
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        window.location.reload();
        return;
      }
      
      // Extract error message from response
      const errorMessage = data.error || data.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    
    return data;
  } catch (error) {
    console.error(`API request failed for ${endpoint}:`, error);
    
    // Handle network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error: Please check your internet connection');
    }
    
    throw error;
  }
};

// Auth endpoints
export const login = async (email, password) => {
  return await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
};

export const register = async (username, email, password) => {
  return await apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password })
  });
};

export const getProfile = async () => {
  const result = await apiRequest('/auth/me');
  return result.user;
};

// Title endpoints
export const createTitle = async (title, instructions) => {
  console.log('API createTitle called with:', { title, instructions });
  
  const result = await apiRequest('/titles', {
    method: 'POST',
    body: JSON.stringify({ title, instructions })
  });
  
  console.log('API createTitle response:', result);
  return result;
};

export const getTitles = async () => {
  const result = await apiRequest('/titles');
  return result.titles || [];
};

export const getTitle = async (id) => {
  const result = await apiRequest(`/titles/${id}`);
  return result.title || result;
};

export const updateTitle = async (id, title, instructions) => {
  const result = await apiRequest(`/titles/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ title, instructions })
  });
  return result;
};

export const deleteTitle = async (id) => {
  return await apiRequest(`/titles/${id}`, {
    method: 'DELETE'
  });
};

// Reference endpoints
export const uploadReference = async (imageData, titleId = null, isGlobal = false) => {
  const result = await apiRequest('/references', {
    method: 'POST',
    body: JSON.stringify({ 
      imageData: imageData,
      titleId: titleId,
      isGlobal: isGlobal
    })
  });
  return result;
};

export const getReferences = async (titleId) => {
  const result = await apiRequest(`/references/${titleId}`);
  return result.references || [];
};

export const getGlobalReferences = async () => {
  const result = await apiRequest('/references/global');
  return result.references || [];
};

export const deleteReference = async (id) => {
  return await apiRequest(`/references/${id}`, {
    method: 'DELETE'
  });
};

// Painting endpoints
export const generatePaintings = async (titleId, quantity = 5) => {
  return await apiRequest('/paintings/generate', {
    method: 'POST',
    body: JSON.stringify({ titleId, quantity })
  });
};

export const getPaintings = async (titleId) => {
  return await apiRequest(`/paintings/${titleId}`);
};

export const regeneratePainting = async (paintingId) => {
  return await apiRequest(`/paintings/${paintingId}/regenerate`, {
    method: 'POST'
  });
};

export default async () => ensureAPI(); 