import { API, authHeaders } from './config.js';

const app = {
  token: localStorage.getItem('token') || '',

  init() {
    this.token = localStorage.getItem('token') || '';
    if (this.token) {
      document.getElementById('navbar').style.display = 'flex';
      this.updateUserUI();
      this.show('dashboard');
    } else {
      document.getElementById('navbar').style.display = 'none';
      this.show('login');
    }
  },

  updateUserUI() {
    try {
      const userRaw = localStorage.getItem('user');
      if (userRaw) {
        const user = JSON.parse(userRaw);
        const nameEl = document.getElementById('nav-username');
        const roleEl = document.getElementById('nav-role');
        const avatarEl = document.getElementById('nav-avatar');
        if (nameEl) nameEl.textContent = user.full_name || user.username || 'Admin';
        if (roleEl) roleEl.textContent = user.role === 'admin' ? 'Quản trị viên' : 'Kỹ thuật viên';
        if (avatarEl) {
          const letter = (user.full_name || user.username || 'A').charAt(0).toUpperCase();
          avatarEl.textContent = letter;
        }
      }
    } catch (_) {}
  },

  show(page) {
    document.querySelectorAll('section[id^="page-"]').forEach(el => el.style.display = 'none');
    const el = document.getElementById('page-' + page);
    if (el) el.style.display = 'block';
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.classList.remove('active');
      el.removeAttribute('aria-current');
    });
    const active = document.querySelector(`[data-nav="${page}"]`);
    if (active) {
      active.classList.add('active');
      active.setAttribute('aria-current', 'page');
    }
    if (page === 'dashboard') this.loadDashboard();
    if (page === 'maintenance') this.loadMaintenance();
    if (page === 'inventory') this.loadInventory();
    if (page === 'documents') this.loadDocuments();
  },

  async login() {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    const alertEl = document.getElementById('login-alert');
    if (!user || !pass) {
      alertEl.textContent = 'Vui lòng nhập tài khoản và mật khẩu';
      alertEl.style.display = 'block';
      return;
    }
    try {
      const data = await this.api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: user, password: pass })
      });
      this.token = data.token;
      localStorage.setItem('token', this.token);
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
      }
      document.getElementById('navbar').style.display = 'flex';
      this.updateUserUI();
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
    localStorage.removeItem('user');
    location.reload();
  },

  showLoading(isShow) {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    overlay.style.display = isShow ? 'flex' : 'none';
  },

  async api(path, opts = {}) {
    const isFormData = opts.body instanceof FormData;
    const headers = isFormData
      ? { ...authHeaders() } // Không ghi đè Content-Type khi dùng FormData (browser tự đặt boundary)
      : { ...authHeaders(), ...opts.headers };
    this.showLoading(true);
    try {
      const res = await fetch(`${API.base}${path}`, { ...opts, headers });
      if (res.status === 401 && path !== '/auth/login') { this.logout(); throw new Error('Phiên làm việc đã hết hạn'); }
      if (res.status === 403) {
        throw new Error('Bạn không có quyền thực hiện thao tác này.');
      }
      if (!res.ok) {
        let msg = 'Đã có lỗi xảy ra, vui lòng thử lại sau.';
        try {
          const errData = await res.json();
          if (errData && errData.message) {
            msg = errData.message;
          }
        } catch (_) {}
        // Không expose chi tiết lỗi hệ thống (5xx) ra phía client
        if (res.status >= 500) {
          msg = 'Hệ thống đang bị quá tải hoặc gặp sự cố. Vui lòng thử lại sau.';
        }
        throw new Error(msg);
      }
      return await res.json();
    } finally {
      this.showLoading(false);
    }
  },

  alert(id, msg, type = 'danger') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = `alert alert-${type}`;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');
    el.style.display = 'block';
    setTimeout(() => { if (el) el.style.display = 'none'; }, 5000);
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
      
      const vbPharmaCount = inv.filter(x => x.cong_ty === 'VB Pharma').reduce((s, x) => s + (x.so_luong || 0), 0);
      const vbtechCount = inv.filter(x => x.cong_ty === 'VBTECH').reduce((s, x) => s + (x.so_luong || 0), 0);

      document.getElementById('dashboard-stats').innerHTML = `
        <div class="stat">
          <div class="stat-icon" style="background:#eff6ff; color:#2563eb; border-color:#bfdbfe;">🏢</div>
          <div class="stat-content">
            <div class="value">${rooms.length}</div>
            <div class="label">Phòng máy &amp; Cơ điện</div>
          </div>
        </div>
        <div class="stat">
          <div class="stat-icon" style="background:#fef3c7; color:#d97706; border-color:#fde68a;">🛠️</div>
          <div class="stat-content">
            <div class="value">${maint.length}</div>
            <div class="label">Nhật ký bảo trì</div>
          </div>
        </div>
        <div class="stat">
          <div class="stat-icon" style="background:#ecfdf5; color:#059669; border-color:#a7f3d0;">📦</div>
          <div class="stat-content">
            <div class="value">${totalInv}</div>
            <div class="label">Tổng vật tư tồn kho</div>
          </div>
        </div>
        <div class="stat">
          <div class="stat-icon" style="background:#f0fdf4; color:#16a34a; border-color:#bbf7d0;">⚡</div>
          <div class="stat-content">
            <div class="value" style="font-size:1.6rem;">${vbPharmaCount} <span style="font-size:0.9rem; color:#64748b; font-weight:500;">/ ${vbtechCount}</span></div>
            <div class="label">VB Pharma / VBTECH</div>
          </div>
        </div>
      `;

      const today = new Date();
      const upcoming = maint.filter(m => {
        if (!m.ngay_ke_kep && !m.ngay_thuc_hien) return false;
        const d = new Date(m.ngay_ke_kep || m.ngay_thuc_hien);
        return d >= today && d <= new Date(today.getTime() + 30 * 86400000);
      });
      
      const warn = document.querySelector('#page-dashboard .card:last-child .alert');
      if (warn) {
        if (upcoming.length === 0) {
          warn.innerHTML = '✅ <strong>Hệ thống ổn định:</strong> Không có lịch bảo trì nào đến hạn trong 30 ngày tới.';
          warn.className = 'alert alert-success';
        } else {
          warn.innerHTML = `⚠️ <strong>Cảnh báo:</strong> Có <strong>${upcoming.length}</strong> thiết bị có lịch bảo dưỡng/bảo trì cần thực hiện trong 30 ngày tới!`;
          warn.className = 'alert alert-warning';
        }
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
      
      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:#64748b;">Chưa có lịch hoặc bản ghi bảo trì nào</td></tr>`;
      } else {
        tbody.innerHTML = rows.map(r => {
          let badgeClass = 'bg-primary';
          if (r.loai_bdt && r.loai_bdt.includes('Bảo dưỡng')) badgeClass = 'bg-success';
          if (r.loai_bdt && r.loai_bdt.includes('Sửa chữa')) badgeClass = 'bg-danger';
          if (r.loai_bdt && r.loai_bdt.includes('Hiệu chuẩn')) badgeClass = 'bg-warning';
          
          return `
            <tr>
              <td><strong>${r.ma_phong}</strong></td>
              <td style="font-weight:600; color:#0f172a;">${r.ten_thiet_bi}</td>
              <td><span class="badge ${badgeClass}">${r.loai_bdt}</span></td>
              <td>${r.ngay_thuc_hien || '-'}</td>
              <td>${r.nguoi_thuc_hien || '<span style="color:#94a3b8;">-</span>'}</td>
              <td>${r.ket_qua ? `<span style="color:#047857;">${r.ket_qua}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
              <td style="text-align:right;">
                <button class="btn btn-outline btn-sm btn-danger" style="color:#ef4444; border-color:#fecaca;" onclick="app.deleteMaintenance(${r.id})">
                  Xóa
                </button>
              </td>
            </tr>
          `;
        }).join('');
      }

      const rooms = await this.api('/maintenance/rooms');
      const sel = document.getElementById('maint-room-filter');
      const current = sel.value;
      sel.innerHTML = '<option value="">Tất cả phòng cơ điện</option>' +
        (rooms.data || []).map(r => `<option value="${r.ma_phong}" ${r.ma_phong === current ? 'selected' : ''}>${r.ma_phong} - ${r.ten_phong}</option>`).join('');
    } catch (e) { this.alert('maint-alert', e.message); }
  },

  openModal(id) { document.getElementById(id).classList.add('open'); },
  closeModal(id) { document.getElementById(id).classList.remove('open'); },

  async saveMaintenance() {
    const payload = {
      ma_phong: document.getElementById('m-maphong').value.trim(),
      ten_thiet_bi: document.getElementById('m-thietbi').value.trim(),
      loai_bdt: document.getElementById('m-loaibdt').value,
      ngay_thuc_hien: document.getElementById('m-ngay').value,
      ngay_ke_kep: document.getElementById('m-kekep').value,
      nguoi_thuc_hien: document.getElementById('m-nguoi').value.trim(),
      ket_qua: document.getElementById('m-ketqua').value.trim(),
      ghi_chu: document.getElementById('m-ghichu').value.trim()
    };
    if (!payload.ma_phong || !payload.ten_thiet_bi) {
      this.alert('maint-modal-alert', 'Vui lòng nhập mã phòng và tên thiết bị');
      return;
    }
    try {
      await this.api('/maintenance/maintenance', { method: 'POST', body: JSON.stringify(payload) });
      this.closeModal('modal-maintenance');
      this.loadMaintenance();
    } catch (e) { this.alert('maint-modal-alert', e.message); }
  },

  async deleteMaintenance(id) {
    if (!confirm('Xác nhận xóa bản ghi bảo trì này?')) return;
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
      
      // Update kho filter list
      const khoSet = new Set();
      rows.forEach(r => { if (r.kho) khoSet.add(r.kho); });
      const khoSelect = document.getElementById('inv-kho-filter');
      const curKho = khoSelect.value;
      khoSelect.innerHTML = '<option value="">🏪 Tất cả kho vật tư</option>' +
        Array.from(khoSet).map(k => `<option value="${k}" ${k === curKho ? 'selected' : ''}>${k}</option>`).join('');

      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:#64748b;">Không tìm thấy vật tư nào trong kho</td></tr>`;
      } else {
        tbody.innerHTML = rows.map(r => {
          const compBadge = r.cong_ty === 'VBTECH' 
            ? '<span class="badge bg-vbtech">⚡ VBTECH</span>'
            : '<span class="badge bg-vbpharma">🏢 VB Pharma</span>';
          
          const qtyDisplay = r.so_luong <= 5 
            ? `<span style="color:#ef4444; font-weight:800;">${r.so_luong}</span> <span class="badge bg-danger">Sắp hết</span>`
            : `<strong>${r.so_luong}</strong>`;

          return `
            <tr>
              <td><code style="font-weight:700; color:#1e40af; background:#eff6ff; padding:2px 6px; border-radius:4px;">${r.ma_vat_tu}</code></td>
              <td style="font-weight:600; color:#0f172a;">${r.ten_vat_tu}</td>
              <td>${r.don_vi_tinh || '-'}</td>
              <td>${qtyDisplay}</td>
              <td>${compBadge}</td>
              <td><span class="badge bg-gray">${r.kho || 'Kho chung'}</span></td>
              <td style="text-align:right;">
                <button class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#fecaca;" onclick="app.deleteInventory('${r.ma_vat_tu}')">
                  Xóa
                </button>
              </td>
            </tr>
          `;
        }).join('');
      }
    } catch (e) { this.alert('inv-alert', e.message); }
  },

  async saveInventory() {
    const giaInput = document.getElementById('i-gia');
    const payload = {
      ma_vat_tu: document.getElementById('i-mavt').value.trim(),
      ten_vat_tu: document.getElementById('i-tenvt').value.trim(),
      don_vi_tinh: document.getElementById('i-dvt').value.trim(),
      so_luong: parseInt(document.getElementById('i-soluong').value) || 0,
      gia_nhap: giaInput ? (parseFloat(giaInput.value) || 0) : 0,
      nha_san_xuat: document.getElementById('i-nsx').value.trim(),
      cong_ty: document.getElementById('i-congty').value,
      kho: document.getElementById('i-kho').value.trim(),
      mo_ta: document.getElementById('i-mota').value.trim()
    };
    if (!payload.ma_vat_tu || !payload.ten_vat_tu) {
      this.alert('inv-modal-alert', 'Vui lòng nhập mã vật tư và tên vật tư');
      return;
    }
    try {
      await this.api('/inventory/', { method: 'POST', body: JSON.stringify(payload) });
      this.closeModal('modal-inventory');
      this.loadInventory();
    } catch (e) { this.alert('inv-modal-alert', e.message); }
  },

  async deleteInventory(ma) {
    if (!confirm(`Xác nhận xóa vật tư ${ma}?`)) return;
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
      
      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:32px; color:#64748b;">Chưa có tài liệu hoặc hồ sơ nào được tải lên</td></tr>`;
      } else {
        tbody.innerHTML = rows.map(r => `
          <tr>
            <td><strong>${r.ma_hs}</strong></td>
            <td style="font-weight:600; color:#0f172a;">${r.ten_hs}</td>
            <td><span class="badge bg-primary">${r.loai_hs || 'Quy trình'}</span></td>
            <td>${r.ma_phong ? `<span class="badge bg-gray">${r.ma_phong}</span>` : '-'}</td>
            <td>
              <a href="#" style="color:#0284c7; font-weight:600; display:inline-flex; align-items:center; gap:4px;" onclick="app.downloadDoc(${r.id})">
                📄 ${r.file_name}
              </a>
            </td>
            <td>${this.formatSize(r.file_size)}</td>
            <td>${r.uploaded_by || 'Admin'}</td>
            <td>${r.uploaded_at ? r.uploaded_at.substring(0, 10) : '-'}</td>
            <td style="text-align:right;">
              <button class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#fecaca;" onclick="app.deleteDoc(${r.id})">Xóa</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (e) { this.alert('doc-alert', e.message); }
  },

  async saveDocument() {
    const fileInput = document.getElementById('d-file');
    if (!fileInput.files || fileInput.files.length === 0) {
      this.alert('doc-modal-alert', 'Vui lòng chọn file đính kèm');
      return;
    }
    const mahs = document.getElementById('d-mahs').value.trim();
    const tenhs = document.getElementById('d-tenhs').value.trim();
    if (!mahs || !tenhs) {
      this.alert('doc-modal-alert', 'Vui lòng nhập mã hồ sơ và tên hồ sơ');
      return;
    }

    const formData = new FormData();
    formData.append('ma_hs', mahs);
    formData.append('ten_hs', tenhs);
    formData.append('loai_hs', document.getElementById('d-loaihs').value);
    formData.append('ma_phong', document.getElementById('d-maphong').value.trim());
    formData.append('ma_vat_tu', document.getElementById('d-mavt').value.trim());
    formData.append('ghi_chu', document.getElementById('d-ghichu').value.trim());
    formData.append('file', fileInput.files[0]);
    
    try {
      const data = await this.api('/documents/', {
        method: 'POST',
        body: formData
      });
      this.closeModal('modal-documents');
      this.loadDocuments();
    } catch (e) { this.alert('doc-modal-alert', e.message); }
  },

  async downloadDoc(id) {
    try {
      window.location.href = `${API.base}/documents/download/${id}`;
    } catch (e) {
      console.error(e);
    }
  },

  async deleteDoc(id) {
    if (!confirm('Xác nhận xóa hồ sơ này?')) return;
    try {
      await this.api(`/documents/${id}`, { method: 'DELETE' });
      this.loadDocuments();
    } catch (e) { this.alert('doc-alert', e.message); }
  }
};

window.app = app;
app.init();
