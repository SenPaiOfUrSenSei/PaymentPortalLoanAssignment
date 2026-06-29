// JWT Authentication utilities for ArisX Frontend

export const getToken = () => {
  return localStorage.getItem('jwt_token')
}

export const setToken = (token) => {
  if (token) {
    localStorage.setItem('jwt_token', token)
  } else {
    localStorage.removeItem('jwt_token')
  }
}

export const getUser = () => {
  const userStr = localStorage.getItem('auth_user')
  if (!userStr) return null
  try {
    return JSON.parse(userStr)
  } catch (e) {
    localStorage.removeItem('auth_user')
    return null
  }
}

export const setUser = (user) => {
  if (user) {
    localStorage.setItem('auth_user', JSON.stringify(user))
  } else {
    localStorage.removeItem('auth_user')
  }
}

export const logout = () => {
  localStorage.removeItem('jwt_token')
  localStorage.removeItem('auth_user')
}

export const isAuthenticated = () => {
  const token = getToken()
  if (!token) return false
  
  // Basic payload inspection for expiration
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      logout()
      return false
    }
    return true
  } catch (e) {
    logout()
    return false
  }
}

/**
 * Custom fetch wrapper that appends JWT Authorization header
 */
export const authFetch = async (url, options = {}) => {
  const token = getToken()
  const headers = {
    ...options.headers,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  // Handle unauthorized responses (expired/invalid tokens)
  if (response.status === 401) {
    logout()
    // Redirect to home or auth page
    window.location.href = '/auth'
    throw new Error('Session expired. Please sign in again.')
  }

  return response
}
