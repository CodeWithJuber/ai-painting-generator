// Simple API service for same-origin requests
const API_BASE_URL = '/api';

// Helper function to make API requests
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
    
    console.log(`API response for ${endpoint}:`, { status: response.status, data });
    
    if (!response.ok) {
      // Extract error message from response
      const errorMessage = data.error || data.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    
    return data;
  } catch (error) {
    console.error(`API request failed for ${endpoint}:`, error);
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
  
  // The backend returns the title object directly, not wrapped
  return result;
};

export const getTitles = async () => {
  const result = await apiRequest('/titles');
  return result.titles || result || [];
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
  return result.title || result;
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
      image_data: imageData, 
      title_id: titleId, 
      is_global: isGlobal 
    })
  });
  return result.reference || result;
};

export const getReferences = async (titleId) => {
  const result = await apiRequest(`/references/${titleId}`);
  return result.references || result || [];
};

export const getGlobalReferences = async () => {
  const result = await apiRequest('/references/global');
  return result.references || result || [];
};

export const deleteReference = async (id) => {
  return await apiRequest(`/references/${id}`, {
    method: 'DELETE'
  });
};

// Painting endpoints
export const generateThumbnails = async (titleId, quantity = 5) => {
  return await apiRequest('/paintings/generate', {
    method: 'POST',
    body: JSON.stringify({ titleId, quantity })
  });
};

export const getThumbnails = async (titleId) => {
  return await apiRequest(`/paintings/${titleId}`);
};

export const regeneratePainting = async (paintingId) => {
  return await apiRequest(`/paintings/${paintingId}/regenerate`, {
    method: 'POST'
  });
};

export default async () => ensureAPI(); 