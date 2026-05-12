import axios from 'axios'

const envBaseUrl = import.meta.env.VITE_BASE_URL?.trim()
const isLocalhostBaseUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(envBaseUrl || '')

// In production, fallback to same-origin API when env accidentally points to localhost.
const baseURL = import.meta.env.PROD && isLocalhostBaseUrl ? '' : (envBaseUrl || '')

const api = axios.create({
    baseURL
})

export default api