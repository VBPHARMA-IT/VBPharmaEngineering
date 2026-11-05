import { API, authHeaders } from './config.js?v=20261105-120300';

const ROLE_LABELS = {
  admin: '👑 Quản trị viên (Admin)',
  manager: '🛡️ Quản lý Kỹ thuật',
  user: '🛠️ Kỹ thuật viên',
  viewer: '👁️ Chỉ xem (Viewer)'
};

const PERM_LABELS = {
  dashboard: 'Tổng quan',
  maintenance: 'Bảo trì',
  inventory: 'Vật tư',
  documents: 'Hồ sơ',
  admin: 'Quản trị HT'
};

const app = {
  token: localStorage.getItem('token') || '',
  currentUser: null,
  adminUsersCache: [],
  inventoryCache: [],
  allInventoryCache: [],

  async init() {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.autocomplete-wrap')) {
        const listEl = document.getElementById('mv-suggestions');
        if (listEl) listEl.style.display = 'none';
      }
    });
    this.token = localStorage.getItem('token') || '';
    if (this.token) {
      await this.refreshCurrentUser();
      this.enterWorkspace();
    } else {
      this.showLoginScreen();
    }
  },

  async refreshCurrentUser() {
    try {
      const res = await this.api('/auth/me');
      if (res && res.user) {
        this.currentUser = res.user;
        localStorage.setItem('user', JSON.stringify(res.user));
      }
    } catch (_) {
      try {
        const raw = localStorage.getItem('user');
        if (raw) this.currentUser = JSON.parse(raw);
      } catch (__) {}
    }
  },

  showLoginScreen() {
    document.getElementById('navbar').style.display = 'none';
    document.getElementById('app-workspace').style.display = 'none';
    document.getElementById('app-footer').style.display = 'none';
    document.getElementById('page-login').style.display = 'block';
  },

  enterWorkspace() {
    document.getElementById('page-login').style.display = 'none';
    document.getElementById('navbar').style.display = 'flex';
    document.getElementById('app-workspace').style.display = 'block';
    document.getElementById('app-footer').style.display = 'block';
    this.updateUserUI();
    this.show('dashboard');
  },

  hasPerm(moduleName) {
    const u = this.currentUser;
    if (!u) return true;
    if (u.role === 'admin') return true;
    if (Array.isArray(u.permissions)) return u.permissions.includes(moduleName);
    return moduleName !== 'admin';
  },

  updateUserUI() {
    try {
      const userRaw = localStorage.getItem('user');
      const user = this.currentUser || (userRaw ? JSON.parse(userRaw) : null);
      if (user) {
        this.currentUser = user;
        const nameEl = document.getElementById('nav-username');
        const roleEl = document.getElementById('nav-role');
        const avatarEl = document.getElementById('nav-avatar');
        if (nameEl) nameEl.textContent = user.full_name || user.username || 'Admin';
        if (roleEl) roleEl.textContent = ROLE_LABELS[user.role] || 'Kỹ thuật viên';
        if (avatarEl) {
          const letter = (user.full_name || user.username || 'A').charAt(0).toUpperCase();
          avatarEl.textContent = letter;
        }

        // Ẩn/hiện các mục điều hướng theo phân quyền
        ['dashboard', 'maintenance', 'inventory', 'documents', 'admin'].forEach(mod => {
          const navEl = document.getElementById(`nav-item-${mod}`);
          if (navEl) {
            navEl.style.display = this.hasPerm(mod) ? 'inline-flex' : 'none';
          }
        });
      }
    } catch (_) {}
  },

  show(page) {
    if (page !== 'login' && !this.hasPerm(page)) {
      alert('Tài khoản của bạn không được cấp quyền truy cập phân hệ này.');
      return;
    }
    document.querySelectorAll('#app-workspace > section[id^="page-"]').forEach(el => el.style.display = 'none');
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
    if (page === 'admin') this.loadAdminPanel();
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
        this.currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(data.user));
      }
      alertEl.style.display = 'none';
      this.enterWorkspace();
    } catch (e) {
      alertEl.textContent = e.message;
      alertEl.style.display = 'block';
    }
  },

  logout() {
    this.token = '';
    this.currentUser = null;
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
    const token = localStorage.getItem('token');
    const headers = isFormData
      ? (token ? { 'Authorization': `Bearer ${token}` } : {})
      : { ...authHeaders(false), ...opts.headers };
    this.showLoading(true);
    try {
      const res = await fetch(`${API.base}${path}`, { ...opts, headers });
      if (res.status === 401 && path !== '/auth/login') {
        this.logout();
        throw new Error('Phiên làm việc đã hết hạn');
      }
      if (!res.ok) {
        let msg = res.status === 403
          ? 'Bạn không có quyền thực hiện thao tác này.'
          : 'Đã có lỗi xảy ra, vui lòng thử lại sau.';
        try {
          const errData = await res.json();
          if (errData && errData.message) {
            msg = errData.message;
          }
        } catch (_) {}
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

  formatMoney(v) {
    return Number(v || 0).toLocaleString('vi-VN') + ' ₫';
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

      const warn = document.getElementById('dashboard-upcoming-alert');
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
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:#64748b;">Chưa có lịch hoặc bản ghi bảo trì nào</td></tr>`;
      } else {
        tbody.innerHTML = rows.map(r => {
          let badgeClass = 'bg-primary';
          if (r.loai_bdt && r.loai_bdt.includes('Bảo dưỡng')) badgeClass = 'bg-success';
          if (r.loai_bdt && r.loai_bdt.includes('Sửa chữa')) badgeClass = 'bg-danger';
          if (r.loai_bdt && r.loai_bdt.includes('Hiệu chuẩn')) badgeClass = 'bg-warning';

          return `
            <tr>
              <td><code style="font-weight:700; color:#1e40af; background:#eff6ff; padding:3px 8px; border-radius:4px;">${r.ma_phong}</code></td>
              <td style="font-weight:600; color:#0f172a;">${r.ten_thiet_bi}</td>
              <td><span class="badge ${badgeClass}">${r.loai_bdt}</span></td>
              <td>${r.ngay_thuc_hien || '-'}</td>
              <td>${r.ngay_ke_kep || '<span style="color:#94a3b8;">-</span>'}</td>
              <td>${r.nguoi_thuc_hien || '<span style="color:#94a3b8;">-</span>'}</td>
              <td>${r.ket_qua ? `<span style="color:#047857; font-weight:600;">${r.ket_qua}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
              <td style="text-align:right;">
                <button class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#fecaca;" onclick="app.deleteMaintenance(${r.id})">
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

  async saveRoom() {
    const payload = {
      ma_phong: document.getElementById('r-maphong').value.trim(),
      ten_phong: document.getElementById('r-tenphong').value.trim(),
      dia_chi: document.getElementById('r-diachi').value.trim(),
      loai_phong: document.getElementById('r-loaiphong').value.trim(),
      mo_ta: document.getElementById('r-mota').value.trim()
    };
    if (!payload.ma_phong || !payload.ten_phong) {
      this.alert('room-modal-alert', 'Vui lòng nhập mã phòng và tên phòng cơ điện');
      return;
    }
    try {
      await this.api('/maintenance/rooms', { method: 'POST', body: JSON.stringify(payload) });
      this.closeModal('modal-room');
      document.getElementById('r-maphong').value = '';
      document.getElementById('r-tenphong').value = '';
      this.loadMaintenance();
      if (document.getElementById('page-admin').style.display !== 'none') {
        this.loadAdminPanel();
      }
    } catch (e) {
      this.alert('room-modal-alert', e.message);
    }
  },

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
    if (!payload.ma_phong || !payload.ten_thiet_bi || !payload.ngay_thuc_hien) {
      this.alert('maint-modal-alert', 'Vui lòng nhập mã phòng, tên thiết bị và ngày thực hiện');
      return;
    }
    try {
      await this.api('/maintenance/maintenance', { method: 'POST', body: JSON.stringify(payload) });
      this.closeModal('modal-maintenance');
      this.loadMaintenance();
      this.loadDashboard();
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
  normalizeText(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  },

  async loadInventory() {
    const congTy = document.getElementById('inv-company-filter').value;
    const kho = document.getElementById('inv-kho-filter').value;
    let url = '/inventory/';
    const params = [];
    if (congTy) params.push('cong_ty=' + encodeURIComponent(congTy));
    if (kho) params.push('kho=' + encodeURIComponent(kho));
    if (params.length) url += '?' + params.join('&');
    try {
      const [data, allData] = await Promise.all([
        this.api(url),
        params.length ? this.api('/inventory/') : Promise.resolve(null)
      ]);
      const rows = data.data || [];
      this.inventoryCache = rows;
      this.allInventoryCache = allData ? (allData.data || rows) : rows;

      const khoSet = new Set();
      this.allInventoryCache.forEach(r => { if (r.kho) khoSet.add(r.kho); });
      const khoSelect = document.getElementById('inv-kho-filter');
      const curKho = khoSelect.value;
      khoSelect.innerHTML = '<option value="">🏪 Tất cả kho vật tư</option>' +
        Array.from(khoSet).map(k => `<option value="${k}" ${k === curKho ? 'selected' : ''}>${k}</option>`).join('');

      this.renderInventoryTable();
    } catch (e) { this.alert('inv-alert', e.message); }
  },

  renderInventoryTable() {
    const tbody = document.getElementById('inv-tbody');
    if (!tbody) return;
    const searchEl = document.getElementById('inv-search-input');
    const q = this.normalizeText(searchEl ? searchEl.value : '');

    const filtered = (this.inventoryCache || []).filter(r => {
      if (!q) return true;
      const haystack = this.normalizeText(
        `${r.ma_vat_tu} ${r.ten_vat_tu} ${r.nha_san_xuat || ''} ${r.kho || ''} ${r.mo_ta || ''} ${r.don_vi_tinh || ''}`
      );
      return haystack.includes(q);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:#64748b;">Không tìm thấy vật tư nào phù hợp</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(r => {
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
          <td>${r.nha_san_xuat || '<span style="color:#94a3b8;">-</span>'}</td>
          <td>${compBadge}</td>
          <td><span class="badge bg-gray">${r.kho || 'Kho chung'}</span></td>
          <td style="text-align:right; white-space:nowrap;">
            <button class="btn btn-outline btn-sm" style="color:#1d4ed8; border-color:#bfdbfe;" onclick="app.openMovementModal('${r.ma_vat_tu}')">
              ⇄ Nhập/Xuất
            </button>
            <button class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#fecaca;" onclick="app.deleteInventory('${r.ma_vat_tu}')">
              Xóa
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async openMovementModal(preselectedMaVt = '') {
    if (!this.allInventoryCache || this.allInventoryCache.length === 0) {
      try {
        const res = await this.api('/inventory/');
        this.allInventoryCache = res.data || [];
      } catch (_) {}
    }
    const searchInput = document.getElementById('mv-search');
    const hiddenMaVt = document.getElementById('mv-mavt');
    const cardEl = document.getElementById('mv-selected-card');
    const listEl = document.getElementById('mv-suggestions');

    if (searchInput) searchInput.value = '';
    if (hiddenMaVt) hiddenMaVt.value = '';
    if (cardEl) {
      cardEl.style.display = 'none';
      cardEl.innerHTML = '';
    }
    if (listEl) listEl.style.display = 'none';

    document.getElementById('mv-soluong').value = 1;
    document.getElementById('mv-ghichu').value = '';

    if (preselectedMaVt) {
      this.selectMovementMaterial(preselectedMaVt);
    }

    this.openModal('modal-movement');
  },

  onMovementSearchInput() {
    const searchInput = document.getElementById('mv-search');
    const listEl = document.getElementById('mv-suggestions');
    const hiddenMaVt = document.getElementById('mv-mavt');
    const cardEl = document.getElementById('mv-selected-card');
    if (!searchInput || !listEl) return;

    const raw = searchInput.value.trim();
    const q = this.normalizeText(raw);

    // Nếu người dùng đang sửa text khác với vật tư đã chọn thì reset lựa chọn cũ
    if (hiddenMaVt && hiddenMaVt.value) {
      const curItem = (this.allInventoryCache || []).find(x => x.ma_vat_tu === hiddenMaVt.value);
      if (!curItem || raw !== `${curItem.ten_vat_tu} (${curItem.ma_vat_tu})`) {
        hiddenMaVt.value = '';
        if (cardEl) cardEl.style.display = 'none';
      }
    }

    const source = this.allInventoryCache || this.inventoryCache || [];
    const matches = source.filter(r => {
      if (!q) return true;
      const hay = this.normalizeText(`${r.ten_vat_tu} ${r.ma_vat_tu} ${r.nha_san_xuat || ''} ${r.kho || ''}`);
      return hay.includes(q);
    }).slice(0, 15);

    if (matches.length === 0) {
      listEl.innerHTML = `<div style="padding:12px 14px; color:#64748b; font-size:0.86rem;">Không tìm thấy vật tư phù hợp với "${raw}"</div>`;
      listEl.style.display = 'block';
      return;
    }

    listEl.innerHTML = matches.map(r => `
      <div class="autocomplete-item" onclick="app.selectMovementMaterial('${r.ma_vat_tu}')">
        <div class="autocomplete-item-main">
          <div class="autocomplete-item-name">${r.ten_vat_tu}</div>
          <div class="autocomplete-item-meta">
            <code style="color:#1d4ed8; font-weight:700;">${r.ma_vat_tu}</code>
            <span>• ${r.cong_ty}</span>
            <span>• ${r.kho || 'Kho chung'}</span>
          </div>
        </div>
        <div class="autocomplete-item-stock">Tồn: ${r.so_luong} ${r.don_vi_tinh || ''}</div>
      </div>
    `).join('');
    listEl.style.display = 'block';
  },

  selectMovementMaterial(maVt) {
    const source = this.allInventoryCache || this.inventoryCache || [];
    const item = source.find(x => x.ma_vat_tu === maVt);
    if (!item) return;

    const searchInput = document.getElementById('mv-search');
    const hiddenMaVt = document.getElementById('mv-mavt');
    const listEl = document.getElementById('mv-suggestions');
    const cardEl = document.getElementById('mv-selected-card');

    if (hiddenMaVt) hiddenMaVt.value = item.ma_vat_tu;
    if (searchInput) searchInput.value = `${item.ten_vat_tu} (${item.ma_vat_tu})`;
    if (listEl) listEl.style.display = 'none';
    if (cardEl) {
      cardEl.innerHTML = `
        <div>
          ✅ Đã chọn: <strong>${item.ten_vat_tu}</strong>
          <code style="margin-left:6px; background:#dbeafe; padding:2px 6px; border-radius:4px; font-weight:700;">${item.ma_vat_tu}</code>
        </div>
        <div>Tồn hiện tại: <strong>${item.so_luong} ${item.don_vi_tinh || ''}</strong></div>
      `;
      cardEl.style.display = 'flex';
    }
  },

  async saveInventory() {
    const payload = {
      ma_vat_tu: document.getElementById('i-mavt').value.trim(),
      ten_vat_tu: document.getElementById('i-tenvt').value.trim(),
      don_vi_tinh: document.getElementById('i-dvt').value.trim(),
      so_luong: parseInt(document.getElementById('i-soluong').value) || 0,
      gia_nhap: 0,
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
      document.getElementById('i-mavt').value = '';
      document.getElementById('i-tenvt').value = '';
      this.loadInventory();
    } catch (e) { this.alert('inv-modal-alert', e.message); }
  },

  async saveMovement() {
    let maVt = document.getElementById('mv-mavt').value.trim();
    const rawSearch = (document.getElementById('mv-search')?.value || '').trim();

    if (!maVt && rawSearch) {
      const q = this.normalizeText(rawSearch);
      const source = this.allInventoryCache || this.inventoryCache || [];
      const exact = source.find(x =>
        this.normalizeText(x.ma_vat_tu) === q ||
        this.normalizeText(x.ten_vat_tu) === q ||
        `${x.ten_vat_tu} (${x.ma_vat_tu})` === rawSearch
      );
      if (exact) {
        maVt = exact.ma_vat_tu;
      } else {
        const partial = source.filter(x =>
          this.normalizeText(`${x.ten_vat_tu} ${x.ma_vat_tu}`).includes(q)
        );
        if (partial.length === 1) maVt = partial[0].ma_vat_tu;
      }
    }

    const payload = {
      ma_vat_tu: maVt,
      loai: document.getElementById('mv-loai').value,
      so_luong: parseInt(document.getElementById('mv-soluong').value) || 0,
      nguoi_thuc_hien: document.getElementById('mv-nguoi').value.trim(),
      ghi_chu: document.getElementById('mv-ghichu').value.trim()
    };
    if (!payload.ma_vat_tu || payload.so_luong <= 0) {
      this.alert('mov-modal-alert', 'Vui lòng tìm và chọn một vật tư từ danh sách gợi ý cùng số lượng hợp lệ');
      return;
    }
    try {
      await this.api('/inventory/movements', { method: 'POST', body: JSON.stringify(payload) });
      this.closeModal('modal-movement');
      this.loadInventory();
      this.alert('inv-alert', 'Đã cập nhật phiếu nhập/xuất kho thành công!', 'success');
    } catch (e) {
      this.alert('mov-modal-alert', e.message);
    }
  },

  async deleteInventory(ma) {
    if (!confirm(`Xác nhận xóa vật tư ${ma}?`)) return;
    try {
      await this.api(`/inventory/${encodeURIComponent(ma)}`, { method: 'DELETE' });
      this.loadInventory();
    } catch (e) { this.alert('inv-alert', e.message); }
  },

  // ---------- Documents ----------
  fixUtf8FileName(str) {
    if (!str) return '';
    try {
      if (!/[\u0100-\uFFFF]/.test(str) && /[\u0080-\u00FF]/.test(str)) {
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
          bytes[i] = str.charCodeAt(i) & 0xff;
        }
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (decoded) return decoded;
      }
    } catch (_) {}
    return str;
  },

  async loadDocuments() {
    try {
      const data = await this.api('/documents/');
      const rows = data.data || [];
      const tbody = document.getElementById('doc-tbody');

      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:32px; color:#64748b;">Chưa có tài liệu hoặc hồ sơ nào được tải lên</td></tr>`;
      } else {
        tbody.innerHTML = rows.map(r => {
          const cleanName = this.fixUtf8FileName(r.file_name);
          const safeJsName = cleanName.replace(/'/g, "\\'");
          return `
          <tr>
            <td><strong>${r.ma_hs}</strong></td>
            <td style="font-weight:600; color:#0f172a;">${r.ten_hs}</td>
            <td><span class="badge bg-primary">${r.loai_hs || 'Quy trình'}</span></td>
            <td>${r.ma_phong ? `<span class="badge bg-gray">${r.ma_phong}</span>` : '-'}</td>
            <td>
              <a href="#" style="color:#0284c7; font-weight:600; display:inline-flex; align-items:center; gap:4px;" onclick="app.downloadDoc(${r.id}, '${safeJsName}'); return false;">
                📄 ${cleanName}
              </a>
            </td>
            <td>${this.formatSize(r.file_size)}</td>
            <td>${r.uploaded_by || 'Admin'}</td>
            <td>${r.uploaded_at ? r.uploaded_at.substring(0, 10) : '-'}</td>
            <td style="text-align:right;">
              <button class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#fecaca;" onclick="app.deleteDoc(${r.id})">Xóa</button>
            </td>
          </tr>
        `;
        }).join('');
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
    formData.append('file_name_utf8', fileInput.files[0].name);
    formData.append('file', fileInput.files[0]);

    try {
      await this.api('/documents/', {
        method: 'POST',
        body: formData
      });
      this.closeModal('modal-documents');
      this.loadDocuments();
    } catch (e) { this.alert('doc-modal-alert', e.message); }
  },

  async downloadDoc(id, fallbackName = '') {
    try {
      const res = await fetch(`${API.base}/documents/download/${id}`, {
        headers: authHeaders(true)
      });
      if (!res.ok) throw new Error('Không thể tải xuống tài liệu này');
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      let fileName = fallbackName || `TaiLieu-${id}`;
      if (!fallbackName) {
        const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
        if (match && match[1]) fileName = this.fixUtf8FileName(decodeURIComponent(match[1]));
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      this.alert('doc-alert', e.message);
    }
  },

  async deleteDoc(id) {
    if (!confirm('Xác nhận xóa hồ sơ này?')) return;
    try {
      await this.api(`/documents/${id}`, { method: 'DELETE' });
      this.loadDocuments();
    } catch (e) { this.alert('doc-alert', e.message); }
  },

  // =====================================================================
  // ADMIN BACKEND CONTROL CENTER
  // =====================================================================
  switchAdminTab(tab) {
    ['users', 'rooms', 'logs'].forEach(t => {
      const panel = document.getElementById(`admin-tab-${t}`);
      if (panel) panel.style.display = t === tab ? 'block' : 'none';
    });
    document.querySelectorAll('[data-admintab]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-admintab') === tab);
    });
  },

  async loadAdminPanel() {
    try {
      const [overviewRes, usersRes, roomsRes] = await Promise.all([
        this.api('/admin/overview'),
        this.api('/admin/users'),
        this.api('/maintenance/rooms')
      ]);

      const st = overviewRes.stats || {};
      document.getElementById('admin-stats').innerHTML = `
        <div class="stat">
          <div class="stat-icon" style="background:#fef3c7; color:#b45309; border-color:#fde68a;">👥</div>
          <div class="stat-content">
            <div class="value">${st.totalUsers || 0}</div>
            <div class="label">Tài khoản (${st.adminUsers || 0} Admin)</div>
          </div>
        </div>
        <div class="stat">
          <div class="stat-icon" style="background:#eff6ff; color:#1d4ed8; border-color:#bfdbfe;">🏢</div>
          <div class="stat-content">
            <div class="value">${st.totalRooms || 0}</div>
            <div class="label">Phòng cơ điện</div>
          </div>
        </div>
        <div class="stat">
          <div class="stat-icon" style="background:#ecfdf5; color:#047857; border-color:#a7f3d0;">📦</div>
          <div class="stat-content">
            <div class="value">${st.totalItems || 0}</div>
            <div class="label">Danh mục vật tư kho</div>
          </div>
        </div>
        <div class="stat">
          <div class="stat-icon" style="background:#f1f5f9; color:#334155; border-color:#cbd5e1;">📂</div>
          <div class="stat-content">
            <div class="value" style="font-size:1.5rem;">${st.totalDocs || 0} <span style="font-size:0.85rem; color:#64748b;">(${this.formatSize(st.totalDocBytes || 0)})</span></div>
            <div class="label">Hồ sơ lưu trữ</div>
          </div>
        </div>
      `;

      // Render Users table
      this.adminUsersCache = usersRes.data || [];
      const uTbody = document.getElementById('admin-users-tbody');
      uTbody.innerHTML = this.adminUsersCache.map(u => {
        const roleBadge = u.role === 'admin'
          ? '<span class="badge bg-gold">👑 Quản trị viên</span>'
          : u.role === 'manager'
            ? '<span class="badge bg-primary">🛡️ Quản lý KT</span>'
            : u.role === 'viewer'
              ? '<span class="badge bg-gray">👁️ Chỉ xem</span>'
              : '<span class="badge bg-success">🛠️ Kỹ thuật viên</span>';

        const statusBadge = u.status === 'locked'
          ? '<span class="badge bg-danger">🔴 Đã khóa</span>'
          : '<span class="badge bg-success">🟢 Hoạt động</span>';

        const permsHtml = (u.permissions || []).map(p =>
          `<span class="badge bg-gray" style="margin:2px;">${PERM_LABELS[p] || p}</span>`
        ).join('');

        return `
          <tr>
            <td><strong>#${u.id}</strong></td>
            <td><code style="font-weight:700; color:#0f172a; background:#f1f5f9; padding:3px 8px; border-radius:4px;">${u.username}</code></td>
            <td style="font-weight:600;">${u.full_name || '-'}</td>
            <td>${roleBadge}</td>
            <td>${permsHtml}</td>
            <td>${statusBadge}</td>
            <td>${u.created_at ? u.created_at.substring(0, 10) : '-'}</td>
            <td style="text-align:right; white-space:nowrap;">
              <button class="btn btn-outline btn-sm" onclick="app.openEditUserModal(${u.id})">✏️ Sửa / Quyền</button>
              <button class="btn btn-outline btn-sm" style="color:${u.status === 'locked' ? '#059669' : '#d97706'};" onclick="app.toggleLockUser(${u.id})">
                ${u.status === 'locked' ? '🔓 Mở khóa' : '🔒 Khóa'}
              </button>
              <button class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#fecaca;" onclick="app.deleteUser(${u.id})">Xóa</button>
            </td>
          </tr>
        `;
      }).join('');

      // Render Rooms table
      const rooms = roomsRes.data || [];
      const rTbody = document.getElementById('admin-rooms-tbody');
      if (rooms.length === 0) {
        rTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px;">Chưa có phòng cơ điện nào</td></tr>`;
      } else {
        rTbody.innerHTML = rooms.map(r => `
          <tr>
            <td><code style="font-weight:700; color:#1d4ed8; background:#eff6ff; padding:3px 8px; border-radius:4px;">${r.ma_phong}</code></td>
            <td style="font-weight:700;">${r.ten_phong}</td>
            <td>${r.dia_chi || '-'}</td>
            <td><span class="badge bg-primary">${r.loai_phong || 'Cơ điện'}</span></td>
            <td>${r.mo_ta || '-'}</td>
            <td style="text-align:right;">
              <button class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#fecaca;" onclick="app.deleteRoomAdmin(${r.id})">Xóa</button>
            </td>
          </tr>
        `).join('');
      }

      // Render Audit Logs
      const logs = overviewRes.recentLogs || [];
      const lTbody = document.getElementById('admin-logs-tbody');
      if (logs.length === 0) {
        lTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">Chưa có bản ghi nhật ký hệ thống</td></tr>`;
      } else {
        lTbody.innerHTML = logs.map(l => `
          <tr>
            <td style="font-family:var(--font-mono); font-size:0.8rem; color:#475569;">${l.created_at || '-'}</td>
            <td><strong>${l.user || 'system'}</strong></td>
            <td><span class="badge bg-primary">${l.action}</span></td>
            <td><code>${l.table_name}</code></td>
            <td>${l.record_id || '-'}</td>
            <td>${l.details || '-'}</td>
          </tr>
        `).join('');
      }
    } catch (e) {
      this.alert('admin-alert', e.message);
    }
  },

  onRoleChange() {
    const role = document.getElementById('u-role').value;
    const cbs = document.querySelectorAll('.u-perm-cb');
    if (role === 'admin') {
      cbs.forEach(cb => { cb.checked = true; });
    } else if (role === 'viewer') {
      cbs.forEach(cb => { cb.checked = cb.value !== 'admin'; });
    } else {
      document.getElementById('u-perm-admin').checked = false;
    }
  },

  openCreateUserModal() {
    document.getElementById('modal-user-title').innerHTML = '<span>👤+</span> Cấp Phát Tài Khoản Mới';
    document.getElementById('u-id').value = '';
    const uInput = document.getElementById('u-username');
    uInput.value = '';
    uInput.disabled = false;
    document.getElementById('u-fullname').value = '';
    document.getElementById('u-role').value = 'user';
    document.getElementById('u-status').value = 'active';
    document.getElementById('u-password').value = '';
    document.getElementById('u-pass-label').textContent = 'Mật khẩu khởi tạo (Bắt buộc)';
    document.querySelectorAll('.u-perm-cb').forEach(cb => {
      cb.checked = cb.value !== 'admin';
    });
    this.openModal('modal-user');
  },

  openEditUserModal(id) {
    const u = this.adminUsersCache.find(x => x.id === id);
    if (!u) return;
    document.getElementById('modal-user-title').innerHTML = `<span>✏️</span> Điều Chỉnh Quyền & Tài Khoản: ${u.username}`;
    document.getElementById('u-id').value = u.id;
    const uInput = document.getElementById('u-username');
    uInput.value = u.username;
    uInput.disabled = true;
    document.getElementById('u-fullname').value = u.full_name || '';
    document.getElementById('u-role').value = u.role || 'user';
    document.getElementById('u-status').value = u.status || 'active';
    document.getElementById('u-password').value = '';
    document.getElementById('u-pass-label').textContent = 'Đặt lại mật khẩu mới (Để trống nếu giữ nguyên)';
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    document.querySelectorAll('.u-perm-cb').forEach(cb => {
      cb.checked = perms.includes(cb.value);
    });
    this.openModal('modal-user');
  },

  async saveUser() {
    const id = document.getElementById('u-id').value;
    const username = document.getElementById('u-username').value.trim();
    const full_name = document.getElementById('u-fullname').value.trim();
    const role = document.getElementById('u-role').value;
    const status = document.getElementById('u-status').value;
    const password = document.getElementById('u-password').value;
    const permissions = Array.from(document.querySelectorAll('.u-perm-cb:checked')).map(cb => cb.value);

    if (permissions.length === 0) {
      this.alert('user-modal-alert', 'Vui lòng chọn ít nhất 1 phân hệ được phép truy cập');
      return;
    }

    try {
      if (!id) {
        if (!username || !password) {
          this.alert('user-modal-alert', 'Vui lòng nhập tên đăng nhập và mật khẩu khởi tạo');
          return;
        }
        await this.api('/admin/users', {
          method: 'POST',
          body: JSON.stringify({ username, password, full_name, role, permissions, status })
        });
        this.alert('admin-alert', `Đã tạo tài khoản ${username} thành công!`, 'success');
      } else {
        await this.api(`/admin/users/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ full_name, role, permissions, status, password })
        });
        this.alert('admin-alert', `Đã cập nhật tài khoản ${username} thành công!`, 'success');
      }
      this.closeModal('modal-user');
      await this.refreshCurrentUser();
      this.updateUserUI();
      this.loadAdminPanel();
    } catch (e) {
      this.alert('user-modal-alert', e.message);
    }
  },

  async toggleLockUser(id) {
    const u = this.adminUsersCache.find(x => x.id === id);
    if (!u) return;
    const nextStatus = u.status === 'locked' ? 'active' : 'locked';
    const actionText = nextStatus === 'locked' ? 'KHÓA' : 'MỞ KHÓA';
    if (!confirm(`Xác nhận ${actionText} tài khoản "${u.username}"?`)) return;
    try {
      await this.api(`/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      });
      this.alert('admin-alert', `Đã cập nhật trạng thái tài khoản ${u.username}`, 'success');
      this.loadAdminPanel();
    } catch (e) {
      this.alert('admin-alert', e.message);
    }
  },

  async deleteUser(id) {
    const u = this.adminUsersCache.find(x => x.id === id);
    if (!u) return;
    if (!confirm(`Xác nhận XÓA VĨNH VIỄN tài khoản "${u.username}"?`)) return;
    try {
      await this.api(`/admin/users/${id}`, { method: 'DELETE' });
      this.alert('admin-alert', `Đã xóa tài khoản ${u.username}`, 'success');
      this.loadAdminPanel();
    } catch (e) {
      this.alert('admin-alert', e.message);
    }
  },

  async deleteRoomAdmin(id) {
    if (!confirm('Xác nhận xóa phòng cơ điện này?')) return;
    try {
      await this.api(`/admin/rooms/${id}`, { method: 'DELETE' });
      this.alert('admin-alert', 'Đã xóa phòng cơ điện', 'success');
      this.loadAdminPanel();
    } catch (e) {
      this.alert('admin-alert', e.message);
    }
  },

  async clearAuditLogs() {
    if (!confirm('Xác nhận xóa toàn bộ lịch sử nhật ký hệ thống?')) return;
    try {
      await this.api('/admin/audit-logs', { method: 'DELETE' });
      this.alert('admin-alert', 'Đã dọn sạch nhật ký hệ thống', 'success');
      this.loadAdminPanel();
    } catch (e) {
      this.alert('admin-alert', e.message);
    }
  }
};

window.app = app;
app.init();
