// Cấu hình kết nối API
// Có thể override giá trị này bằng cách gán window.__API_BASE__ trước khi load file này
// Ví dụ trong index.html: <script>window.__API_BASE__ = 'https://abc123.trycloudflare.com/api';</script>
// Nếu không override, sẽ dùng giá trị mặc định bên dưới.
const DEFAULT_API_BASE = 'https://disclaimers-generic-respondents-psychological.trycloudflare.com';
const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) || DEFAULT_API_BASE;

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