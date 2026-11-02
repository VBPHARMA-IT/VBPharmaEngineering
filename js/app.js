import { API, authHeaders } from './config.js';

const app = {
  token: localStorage.getItem('token') || '',

  init() {
    this.token = localStorage.getItem('token') || '';
    if (this.token) {
      document.getElementById('navbar').style.display = 'flex';
      this.show('dashboard');
    } else {
      document.getElementById('navbar').style.display = 'none';
    }
  },

  show(page) {
    document.querySelectorAll('section[id^="page-"]').forEach(el => el.style.display = 'none');
    const el = document.getElementById('page-' + page);
    if (el) el.style.display = 'block';
    document.querySelectorAll('[data-nav]').forEach(el => el.classList.remove('active'));
    const active = document.querySelector(`[data-nav="${page}"]`);
    if (active) active.classList.add('active');
    if (page === 'dashboard') this.loadDashboard();
    if (page === 'maintenance') this.loadMaintenance();
    if (page === 'inventory') this.loadInventory();
    if (page === 'documents') this.loadDocuments();
  },

  async login() {
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const alertEl = document.getElementById('login-alert');
    try {
      const res = await fetch(`${API.auth}/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Đăng nhập thất bại');
      this.token = data.token;
      localStorage.setItem('token', this.token);
      document.getElementById('navbar').style.display = 'flex';
      alertEl.style.display = 'none';
      this.show('dashboard');
    } catch (e) {
      alertEl.textContent = e.message;
      alertEl.style.display = 'block';
    }
  },

  logout() {
    this.token = '';
    localStorage.removeItem('token');
    location.reload();
  },

  async api(path, opts = {}) {
    const headers = { ...authHeaders(), ...opts.headers };
    const res = await fetch(`${API.base}${path}`, { ...opts, headers });
    if (res.status === 401) { this.logout(); throw new Error('Phiên hết hạn'); }
    return res.json();
  },

  alert(id, msg, type = 'danger') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = `alert alert-${type}`;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 5000);
  },

  formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // ---------- Dashboard ----------
  async loadDashboard() {
    try {
      const [roomsRes, maintRes, invRes] = await Promise.all([
        this.api('/maintenance/rooms'),
        this.api('/maintenance/maintenance'),
        this.api('/inventory/')
      ]);
      const rooms = roomsRes.data || [];
      const maint = maintRes.data || [];
      const inv = invRes.data || [];
      const totalInv = inv.reduce((s, x) => s + (x.so_luong || 0), 0);
      document.getElementById('dashboard-stats').innerHTML = `
        <div class="stat"><div class="value">${rooms.length}</div><div class="label">Phòng cơ điện</div></div>
        <div class="stat"><div class="value">${maint.length}</div><div class="label">Bản ghi bảo trì</div></div>
        <div class="stat"><div class="value">${totalInv}</div><div class="label">Tổng vật tư tồn kho</div></div>
      `;
      const today = new Date();
      const upcoming = maint.filter(m => {
        const d = new Date(m.ngay_ke_kep || m.ngay_thuc_hien);
        return d >= today && d <= new Date(today.getTime() + 30 * 86400000);
      });
      const warn = document.querySelector('#page-dashboard .card:last-child .alert');
      if (upcoming.length === 0) {
        warn.textContent = 'Không có bảo trì sắp tới trong 30 ngày.';
        warn.className = 'alert alert-success';
      } else {
        warn.innerHTML = `<strong>${upcoming.length}</strong> bản ghi cần bảo trì sắp tới.`;
        warn.className = 'alert alert-warning';
      }
    } catch (e) { this.alert('maint-alert', e.message); }
  },

  // ---------- Maintenance ----------
  async loadMaintenance() {
    const roomFilter = document.getElementById('maint-room-filter').value;
    let url = '/maintenance/maintenance';
    if (roomFilter) url += '?ma_phong=' + encodeURIComponent(roomFilter);
    try {
      const data = await this.api(url);
      const rows = data.data || [];
      const tbody = document.getElementById('maint-tbody');
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${r.ma_phong}</td><td>${r.ten_thiet_bi}</td>
          <td><span class="badge bg-primary">${r.loai_bdt}</span></td>
          <td>${r.ngay_thuc_hien}</td><td>${r.nguoi_thuc_hien || '-'}</td><td>${r.ket_qua || '-'}</td>
          <td><button class="btn btn-outline btn-sm" onclick="app.deleteMaintenance(${r.id})">Xóa</button></td>
        </tr>
      `).join('');
      const rooms = await this.api('/maintenance/rooms');
      const sel = document.getElementById('maint-room-filter');
      const current = sel.value;
      sel.innerHTML = '<option value="">Tất cả phòng</option>' +
        (rooms.data || []).map(r => `<option value="${r.ma_phong}" ${r.ma_phong === current ? 'selected' : ''}>${r.ma_phong} - ${r.ten_phong}</option>`).join('');
    } catch (e) { this.alert('maint-alert', e.message); }
  },

  openModal(id) { document.getElementById(id).classList.add('open'); },
  closeModal(id) { document.getElementById(id).classList.remove('open'); },

  async saveMaintenance() {
    const payload = {
      ma_phong: document.getElementById('m-maphong').value,
      ten_thiet_bi: document.getElementById('m-thietbi').value,
      loai_bdt: document.getElementById('m-loaibdt').value,
      ngay_thuc_hien: document.getElementById('m-ngay').value,
      ngay_ke_kep: document.getElementById('m-kekep').value,
      nguoi_thuc_hien: document.getElementById('m-nguoi').value,
      ket_qua: document.getElementById('m-ketqua').value,
      ghi_chu: document.getElementById('m-ghichu').value
    };
    try {
      await this.api('/maintenance/maintenance', { method: 'POST', body: JSON.stringify(payload) });
      this.closeModal('modal-maintenance');
      this.loadMaintenance();
    } catch (e) { this.alert('maint-modal-alert', e.message); }
  },

  async deleteMaintenance(id) {
    if (!confirm('Xác định xóa bản ghi này?')) return;
    try {
      await this.api(`/maintenance/maintenance/${id}`, { method: 'DELETE' });
      this.loadMaintenance();
    } catch (e) { this.alert('maint-alert', e.message); }
  },

  // ---------- Inventory ----------
  async loadInventory() {
    const congTy = document.getElementById('inv-company-filter').value;
    const kho = document.getElementById('inv-kho-filter').value;
    let url = '/inventory/';
    const params = [];
    if (congTy) params.push('cong_ty=' + encodeURIComponent(congTy));
    if (kho) params.push('kho=' + encodeURIComponent(kho));
    if (params.length) url += '?' + params.join('&');
    try {
      const data = await this.api(url);
      const rows = data.data || [];
      const tbody = document.getElementById('inv-tbody');
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${r.ma_vat_tu}</td><td>${r.ten_vat_tu}</td><td>${r.don_vi_tinh || '-'}</td>
          <td>${r.so_luong}</td><td>${r.cong_ty}</td><td>${r.kho || '-'}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="app.deleteInventory('${r.ma_vat_tu}')">Xóa</button>
          </td>
        </tr>
      `).join('');
    } catch (e) { this.alert('inv-alert', e.message); }
  },

  async saveInventory() {
    const payload = {
      ma_vat_tu: document.getElementById('i-mavt').value,
      ten_vat_tu: document.getElementById('i-tenvt').value,
      don_vi_tinh: document.getElementById('i-dvt').value,
      so_luong: parseInt(document.getElementById('i-soluong').value) || 0,
      gia_nhap: parseFloat(document.getElementById('i-gia').value) || 0,
      nha_san_xuat: document.getElementById('i-nsx').value,
      cong_ty: document.getElementById('i-congty').value,
      kho: document.getElementById('i-kho').value,
      mo_ta: document.getElementById('i-mota').value
    };
    try {
      await this.api('/inventory/', { method: 'POST', body: JSON.stringify(payload) });
      this.closeModal('modal-inventory');
      this.loadInventory();
    } catch (e) { this.alert('inv-modal-alert', e.message); }
  },

  async deleteInventory(ma) {
    if (!confirm('Xác định xóa vật tư này?')) return;
    try {
      await this.api(`/inventory/${encodeURIComponent(ma)}`, { method: 'DELETE' });
      this.loadInventory();
    } catch (e) { this.alert('inv-alert', e.message); }
  },

  // ---------- Documents ----------
  async loadDocuments() {
    try {
      const data = await this.api('/documents/');
      const rows = data.data || [];
      const tbody = document.getElementById('doc-tbody');
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${r.ma_hs}</td><td>${r.ten_hs}</td><td>${r.loai_hs || '-'}</td>
          <td>${r.ma_phong || '-'}</td>
          <td><a href="#" onclick="app.downloadDoc(${r.id})">${r.file_name}</a></td>
          <td>${this.formatSize(r.file_size)}</td>
          <td>${r.uploaded_by || '-'}</td><td>${r.uploaded_at}</td>
          <td><button class="btn btn-outline btn-sm" onclick="app.deleteDoc(${r.id})">Xóa</button></td>
        </tr>
      `).join('');
    } catch (e) { this.alert('doc-alert', e.message); }
  },

  async saveDocument() {
    const fileInput = document.getElementById('d-file');
    if (!fileInput.files || fileInput.files.length === 0) {
      this.alert('doc-modal-alert', 'Vui lòng chọn file'); return;
    }
    const formData = new FormData();
    formData.append('ma_hs', document.getElementById('d-mahs').value);
    formData.append('ten_hs', document.getElementById('d-tenhs').value);
    formData.append('loai_hs', document.getElementById('d-loaihs').value);
    formData.append('ma_phong', document.getElementById('d-maphong').value);
    formData.append('ma_vat_tu', document.getElementById('d-mavt').value);
    formData.append('ghi_chu', document.getElementById('d-ghichu').value);
    formData.append('file', fileInput.files[0]);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API.base}/documents/`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Tải lên thất bại');
      this.closeModal('modal-documents');
      this.loadDocuments();
    } catch (e) { this.alert('doc-modal-alert', e.message); }
  },

  async downloadDoc(id) {
    try {
      const res = await this.api(`/documents/download/${id}`, { method: 'GET' });
    } catch (e) {
      window.location.href = `${API.base}/documents/download/${id}`;
    }
  },

  async deleteDoc(id) {
    if (!confirm('Xác định xóa hồ sơ này?')) return;
    try {
      await this.api(`/documents/${id}`, { method: 'DELETE' });
      this.loadDocuments();
    } catch (e) { this.alert('doc-alert', e.message); }
  }
};

app.init();
