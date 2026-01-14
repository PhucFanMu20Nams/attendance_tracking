import axios from 'axios';

/**
 * Axios client with automatic Bearer token attachment.
 * Base URL from VITE_API_BASE_URL environment variable.
 */
const client = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
});

// Request interceptor: attach Bearer token from localStorage
client.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor: handle 401 (token expired/invalid)
client.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default client;
