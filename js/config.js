// Cấu hình kết nối API
// Thay URL bên dưới bằng URL public từ Cloudflare Tunnel hoặc ngrok trên máy bạn
// Ví dụ: https://abc123.trycloudflare.com
const API_BASE = 'https://molecular-cayman-pleased-settled.trycloudflare.com/api';

const API = {
  base: API_BASE,
  auth: `${API_BASE}/auth`,
  maintenance: `${API_BASE}/maintenance`,
  inventory: `${API_BASE}/inventory`,
  documents: `${API_BASE}/documents`,
  health: `${API_BASE}/health`
};

// Helper headers
function authHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
}

export { API, authHeaders };