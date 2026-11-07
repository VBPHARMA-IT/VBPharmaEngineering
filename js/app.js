import { API, authHeaders } from './config.js?v=20261107-135545';

const ROLE_LABELS = {
  admin: '👑 Quản trị viên (Admin)',
  manager: '🛡️ Quản lý Kỹ thuật',
  user: '🛠️ Kỹ thuật viên',
  viewer: '👁️ Chỉ xem (Viewer)'
};

const FIXED_ACCOUNT_NAMES = {
  admin: 'Nguyễn Thành Chung',
  tpcd: 'Nguyễn Huy Tùng'
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
  movementsCache: [],
  pendingExcelItems: [],

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

  getFixedAccountIdentity(userObj = null) {
    const u = userObj || this.currentUser;
    if (!u) return { username: 'admin', fullName: 'Nguyễn Thành Chung' };
    const uname = String(u.username || 'admin').trim();
    const lower = uname.toLowerCase();
    let fullName = String(u.full_name || '').trim();
    if (FIXED_ACCOUNT_NAMES[lower] && (!fullName || fullName === 'Quản trị viên' || fullName.toLowerCase() === lower)) {
      fullName = FIXED_ACCOUNT_NAMES[lower];
    }
    if (!fullName) {
      fullName = FIXED_ACCOUNT_NAMES[lower] || uname;
    }
    return { username: uname, fullName };
  },

  parseMovementActor(rawActor) {
    const raw = String(rawActor || '').trim();
    if (raw.includes('|')) {
      const parts = raw.split('|').map(s => s.trim());
      const tk = parts[0] || 'admin';
      const lowerTk = tk.toLowerCase();
      const ten = parts[1] || FIXED_ACCOUNT_NAMES[lowerTk] || tk;
      return { username: tk, fullName: ten };
    }
    const lower = raw.toLowerCase();
    if (!raw || lower === 'admin' || lower === 'chung' || lower === 'quản trị viên') {
      return { username: 'admin', fullName: FIXED_ACCOUNT_NAMES.admin };
    }
    if (lower === 'tpcd' || lower === 'nguyễn huy tùng' || lower === 'nguyen huy tung') {
      return { username: 'TPCD', fullName: FIXED_ACCOUNT_NAMES.tpcd };
    }
    const foundUser = (this.adminUsersCache || []).find(
      u => u.username.toLowerCase() === lower || (u.full_name && u.full_name.toLowerCase() === lower)
    );
    if (foundUser) {
      const iden = this.getFixedAccountIdentity(foundUser);
      return { username: iden.username, fullName: iden.fullName };
    }
    if (this.currentUser && (
      this.currentUser.username.toLowerCase() === lower ||
      (this.currentUser.full_name && this.currentUser.full_name.toLowerCase() === lower)
    )) {
      return this.getFixedAccountIdentity(this.currentUser);
    }
    if (FIXED_ACCOUNT_NAMES[lower]) {
      return { username: raw, fullName: FIXED_ACCOUNT_NAMES[lower] };
    }
    return { username: raw, fullName: raw };
  },

  updateUserUI() {
    try {
      const userRaw = localStorage.getItem('user');
      const user = this.currentUser || (userRaw ? JSON.parse(userRaw) : null);
      if (user) {
        this.currentUser = user;
        const iden = this.getFixedAccountIdentity(user);
        const nameEl = document.getElementById('nav-username');
        const roleEl = document.getElementById('nav-role');
        const avatarEl = document.getElementById('nav-avatar');
        if (nameEl) nameEl.textContent = `${iden.fullName} (${iden.username})`;
        if (roleEl) roleEl.textContent = ROLE_LABELS[user.role] || 'Kỹ thuật viên';
        if (avatarEl) {
          const letter = (iden.fullName || iden.username || 'A').charAt(0).toUpperCase();
          avatarEl.textContent = letter;
        }

        // Gắn cố định tên người thực hiện trong phiếu Nhập/Xuất theo tài khoản
        const nguoiInput = document.getElementById('mv-nguoi');
        if (nguoiInput) {
          nguoiInput.value = `${iden.fullName} (${iden.username})`;
        }

        // Ẩn/hiện các mục điều hướng theo phân quyền
        ['dashboard', 'maintenance', 'inventory', 'documents', 'admin'].forEach(mod => {
          const navEl = document.getElementById(`nav-item-${mod}`);
          if (navEl) {
            navEl.style.display = this.hasPerm(mod) ? 'inline-flex' : 'none';
          }
        });

        // Chỉ hiển thị chức năng Tải file Excel vật tư & Tổng hợp xuất vật tư trên tài khoản Admin
        const invAdminEl = document.getElementById('inv-admin-actions');
        if (invAdminEl) {
          invAdminEl.style.display = (user.role === 'admin') ? 'flex' : 'none';
        }

        // Phần 3 (Nhật ký cập nhật Nhập/Xuất) chỉ hiển thị trên Admin hệ thống và Quản lý phòng
        const historyPanelEl = document.getElementById('inv-history-panel');
        if (historyPanelEl) {
          historyPanelEl.style.display = (user.role === 'admin' || user.role === 'manager') ? 'block' : 'none';
        }
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

  // ---------- Inventory (Bố cục 3 phần + Excel Admin + Tổng hợp Admin) ----------
  normalizeText(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  },

  isAdmin() {
    return Boolean(this.currentUser && this.currentUser.role === 'admin');
  },

  isAdminOrManager() {
    return Boolean(this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'manager'));
  },

  async loadInventory() {
    const invAdminEl = document.getElementById('inv-admin-actions');
    if (invAdminEl) {
      invAdminEl.style.display = this.isAdmin() ? 'flex' : 'none';
    }

    const historyPanelEl = document.getElementById('inv-history-panel');
    if (historyPanelEl) {
      historyPanelEl.style.display = this.isAdminOrManager() ? 'block' : 'none';
    }

    const iden = this.getFixedAccountIdentity(this.currentUser);
    const nguoiInput = document.getElementById('mv-nguoi');
    if (nguoiInput) {
      nguoiInput.value = `${iden.fullName} (${iden.username})`;
    }

    const congTy = document.getElementById('inv-company-filter').value;
    let url = '/inventory/';
    const params = [];
    if (congTy) params.push('cong_ty=' + encodeURIComponent(congTy));
    if (params.length) url += '?' + params.join('&');
    try {
      const [data, allData, movData] = await Promise.all([
        this.api(url),
        params.length ? this.api('/inventory/') : Promise.resolve(null),
        this.api('/inventory/movements?limit=200').catch(() => ({ data: [] }))
      ]);
      const rows = data.data || [];
      this.inventoryCache = rows;
      this.allInventoryCache = allData ? (allData.data || rows) : rows;
      this.movementsCache = movData.data || [];

      // Nếu đang chọn sẵn 1 vật tư bên form Nhập/Xuất thì cập nhật lại số tồn mới nhất trên thẻ
      const selectedMa = document.getElementById('mv-mavt')?.value;
      if (selectedMa) {
        this.selectMovementMaterial(selectedMa);
      }

      this.renderInventoryTable();
      this.renderMovementHistory();
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
        `${r.ma_vat_tu} ${r.ten_vat_tu} ${r.mo_ta || ''} ${r.don_vi_tinh || ''}`
      );
      return haystack.includes(q);
    });

    const countBadge = document.getElementById('inv-count-badge');
    if (countBadge) {
      const totalQty = filtered.reduce((s, x) => s + (x.so_luong || 0), 0);
      countBadge.textContent = `${filtered.length} danh mục • Tổng tồn: ${totalQty}`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:#64748b;">Không tìm thấy vật tư nào phù hợp</td></tr>`;
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
          <td>${compBadge}</td>
          <td style="text-align:right; white-space:nowrap;">
            <button class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#fecaca;" onclick="app.deleteInventory('${r.ma_vat_tu}')">
              Xóa
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderMovementHistory() {
    const tbody = document.getElementById('inv-movements-tbody');
    if (!tbody) return;
    if (!this.isAdminOrManager()) {
      tbody.innerHTML = '';
      return;
    }
    const q = this.normalizeText(document.getElementById('mov-history-search')?.value || '');
    const typeFilter = document.getElementById('mov-history-type')?.value || '';

    const itemMap = {};
    (this.allInventoryCache || []).forEach(it => { itemMap[it.ma_vat_tu] = it; });

    const list = (this.movementsCache || []).filter(m => {
      if (typeFilter && m.loai !== typeFilter) return false;
      if (!q) return true;
      const item = itemMap[m.ma_vat_tu] || {};
      const ten = m.ten_vat_tu || item.ten_vat_tu || '';
      const actor = this.parseMovementActor(m.nguoi_thuc_hien);
      const hay = this.normalizeText(`${m.ma_vat_tu} ${ten} ${actor.username} ${actor.fullName} ${m.ghi_chu || ''}`);
      return hay.includes(q);
    });

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748b;">Chưa có phiếu nhập/xuất kho nào phù hợp</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(m => {
      const item = itemMap[m.ma_vat_tu] || {};
      const tenVt = m.ten_vat_tu || item.ten_vat_tu || m.ma_vat_tu;
      const dvt = m.don_vi_tinh || item.don_vi_tinh || '';
      const isNhap = m.loai === 'nhap';
      const typeBadge = isNhap
        ? '<span class="badge bg-success">📥 Nhập kho</span>'
        : '<span class="badge bg-danger">📤 Xuất kho</span>';
      const deltaHtml = isNhap
        ? `<strong style="color:#047857;">+${m.so_luong} ${dvt}</strong>`
        : `<strong style="color:#b91c1c;">-${m.so_luong} ${dvt}</strong>`;
      const actor = this.parseMovementActor(m.nguoi_thuc_hien);

      return `
        <tr>
          <td style="font-family:var(--font-mono); font-size:0.78rem; color:#475569;">${m.ngay_thuc_hien || '-'}</td>
          <td>${typeBadge}</td>
          <td><code style="font-weight:700; color:#1e40af;">${m.ma_vat_tu}</code></td>
          <td style="font-weight:600; color:#0f172a;">${tenVt}</td>
          <td>${deltaHtml}</td>
          <td><code style="font-weight:700; color:#0f172a; background:#f1f5f9; padding:3px 8px; border-radius:4px;">${actor.username}</code></td>
          <td style="font-weight:600; color:#1e293b;">${actor.fullName}</td>
          <td>${m.ghi_chu || '<span style="color:#94a3b8;">-</span>'}</td>
        </tr>
      `;
    }).join('');
  },

  setMovementType(type) {
    const hiddenLoai = document.getElementById('mv-loai');
    const btnNhap = document.getElementById('btn-type-nhap');
    const btnXuat = document.getElementById('btn-type-xuat');
    if (hiddenLoai) hiddenLoai.value = type;
    if (btnNhap) btnNhap.className = 'mov-type-btn' + (type === 'nhap' ? ' active-nhap' : '');
    if (btnXuat) btnXuat.className = 'mov-type-btn' + (type === 'xuat' ? ' active-xuat' : '');
  },

  resetMovementForm() {
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
    this.setMovementType('nhap');
  },

  async openMovementModal(preselectedMaVt = '', type = '') {
    if (!this.allInventoryCache || this.allInventoryCache.length === 0) {
      try {
        const res = await this.api('/inventory/');
        this.allInventoryCache = res.data || [];
      } catch (_) {}
    }
    if (type === 'nhap' || type === 'xuat') {
      this.setMovementType(type);
    }
    if (preselectedMaVt) {
      this.selectMovementMaterial(preselectedMaVt);
      const qtyInput = document.getElementById('mv-soluong');
      if (qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      }
    } else {
      const searchInput = document.getElementById('mv-search');
      if (searchInput) searchInput.focus();
    }
  },

  onMovementSearchInput() {
    const searchInput = document.getElementById('mv-search');
    const listEl = document.getElementById('mv-suggestions');
    const hiddenMaVt = document.getElementById('mv-mavt');
    const cardEl = document.getElementById('mv-selected-card');
    if (!searchInput || !listEl) return;

    const raw = searchInput.value.trim();
    const q = this.normalizeText(raw);

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
      const hay = this.normalizeText(`${r.ten_vat_tu} ${r.ma_vat_tu}`);
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
          ✅ Đang chọn: <strong>${item.ten_vat_tu}</strong>
          <code style="margin-left:6px; background:#dbeafe; padding:2px 6px; border-radius:4px; font-weight:700;">${item.ma_vat_tu}</code>
        </div>
        <div>Tồn kho hiện tại: <strong>${item.so_luong} ${item.don_vi_tinh || ''}</strong></div>
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
      nha_san_xuat: '',
      cong_ty: document.getElementById('i-congty').value,
      kho: '',
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

    const iden = this.getFixedAccountIdentity(this.currentUser);
    const payload = {
      ma_vat_tu: maVt,
      loai: document.getElementById('mv-loai').value,
      so_luong: parseInt(document.getElementById('mv-soluong').value) || 0,
      nguoi_thuc_hien: `${iden.username} | ${iden.fullName}`,
      ghi_chu: document.getElementById('mv-ghichu').value.trim()
    };
    if (!payload.ma_vat_tu || payload.so_luong <= 0) {
      this.alert('mov-modal-alert', 'Vui lòng tìm và chọn một vật tư từ danh sách gợi ý cùng số lượng hợp lệ');
      return;
    }
    try {
      await this.api('/inventory/movements', { method: 'POST', body: JSON.stringify(payload) });
      document.getElementById('mv-soluong').value = 1;
      document.getElementById('mv-ghichu').value = '';
      await this.loadInventory();
      this.alert('inv-alert', `✅ Đã ${payload.loai === 'nhap' ? 'NHẬP' : 'XUẤT'} ${payload.so_luong} vật tư (${payload.ma_vat_tu}) và cập nhật tồn kho thành công!`, 'success');
    } catch (e) {
      this.alert('mov-modal-alert', e.message);
    }
  },

  deleteInventory(ma) {
    const source = this.allInventoryCache || this.inventoryCache || [];
    const item = source.find(x => x.ma_vat_tu === ma) || { ma_vat_tu: ma, ten_vat_tu: ma, so_luong: 0 };
    const maInput = document.getElementById('del-inv-mavt');
    const infoEl = document.getElementById('del-inv-info');
    const reasonEl = document.getElementById('del-inv-reason');
    const alertEl = document.getElementById('del-inv-alert');

    if (maInput) maInput.value = ma;
    if (infoEl) {
      infoEl.innerHTML = `Bạn đang yêu cầu xóa vật tư: <strong>${item.ten_vat_tu}</strong> (Mã: <code>${item.ma_vat_tu}</code> — Tồn kho: <strong>${item.so_luong || 0}</strong>)`;
    }
    if (reasonEl) reasonEl.value = '';
    if (alertEl) alertEl.style.display = 'none';

    this.openModal('modal-delete-inv');
    setTimeout(() => { if (reasonEl) reasonEl.focus(); }, 100);
  },

  async confirmDeleteInventory() {
    const ma = (document.getElementById('del-inv-mavt')?.value || '').trim();
    const reasonEl = document.getElementById('del-inv-reason');
    const reason = (reasonEl ? reasonEl.value : '').trim();

    if (!reason) {
      this.alert('del-inv-alert', '⚠️ Cảnh báo: Bắt buộc phải nhập lý do xóa vật tư! Không được để trống.');
      if (reasonEl) reasonEl.focus();
      return;
    }

    try {
      await this.api(`/inventory/${encodeURIComponent(ma)}?ly_do=${encodeURIComponent(reason)}`, {
        method: 'DELETE',
        body: JSON.stringify({ ly_do: reason })
      });
      this.closeModal('modal-delete-inv');
      await this.loadInventory();
      this.alert('inv-alert', `🗑️ Đã xóa vật tư ${ma} (Lý do: ${reason})`, 'success');
    } catch (e) {
      this.alert('del-inv-alert', e.message);
    }
  },

  // ---------- Chức năng Admin: Tải danh sách vật tư bằng Excel ----------
  openImportExcelModal() {
    if (!this.isAdmin()) {
      alert('Chức năng này chỉ dành cho tài khoản Quản trị viên (Admin).');
      return;
    }
    this.pendingExcelItems = [];
    const fileInput = document.getElementById('inv-excel-file');
    if (fileInput) fileInput.value = '';
    const previewWrap = document.getElementById('excel-preview-wrap');
    if (previewWrap) previewWrap.style.display = 'none';
    this.openModal('modal-inv-excel');
  },

  downloadExcelTemplate() {
    if (typeof XLSX === 'undefined') {
      alert('Thư viện xử lý Excel đang tải, vui lòng thử lại sau giây lát.');
      return;
    }
    const sampleRows = [
      {
        'Mã vật tư': 'VT101',
        'Tên vật tư': 'Vòng bi SKF 6205-2RS',
        'Đơn vị tính': 'Cái',
        'Số lượng': 20,
        'Công ty': 'VB Pharma',
        'Mô tả': 'Vòng bi motor AHU'
      },
      {
        'Mã vật tư': 'VT102',
        'Tên vật tư': 'Cảm biến nhiệt độ PT100 Omron',
        'Đơn vị tính': 'Bộ',
        'Số lượng': 8,
        'Công ty': 'VBTECH',
        'Mô tả': 'Dùng cho tủ điều khiển trung tâm'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Vat_Tu');
    XLSX.writeFile(wb, 'Mau_Nhap_Vat_Tu_Kho_VBPharma.xlsx');
  },

  onExcelFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') {
      this.alert('excel-modal-alert', 'Thư viện Excel chưa sẵn sàng, vui lòng tải lại trang.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

        const parsed = [];
        rawRows.forEach((row, idx) => {
          const normObj = {};
          Object.keys(row).forEach(k => {
            normObj[this.normalizeText(k)] = row[k];
          });

          const pick = (...keys) => {
            for (const k of keys) {
              if (normObj[k] !== undefined && normObj[k] !== '') return normObj[k];
            }
            for (const rk of Object.keys(normObj)) {
              if (keys.some(k => rk.includes(k)) && normObj[rk] !== '') return normObj[rk];
            }
            return '';
          };

          const ma = String(pick('ma vat tu', 'ma vt', 'ma_vat_tu', 'mavt', 'code', 'ma')).trim();
          const ten = String(pick('ten vat tu', 'ten vt', 'ten_vat_tu', 'tenvt', 'name', 'ten')).trim();
          if (!ma && !ten) return;

          const dvt = String(pick('don vi tinh', 'don vi', 'dvt', 'don_vi_tinh', 'unit') || 'Cái').trim();
          const sl = Math.max(0, parseInt(pick('so luong', 'so luong ton', 'ton kho', 'ton', 'sl', 'so_luong', 'qty')) || 0);
          const ctyRaw = String(pick('cong ty', 'don vi so huu', 'cong_ty', 'company') || 'VB Pharma').trim();
          const cong_ty = ctyRaw.toUpperCase().includes('VBTECH') ? 'VBTECH' : 'VB Pharma';
          const mo_ta = String(pick('mo ta', 'ghi chu', 'mo_ta', 'note') || '').trim();

          parsed.push({
            ma_vat_tu: ma || `VT-EX${idx + 1}`,
            ten_vat_tu: ten || `Vật tư ${idx + 1}`,
            don_vi_tinh: dvt,
            so_luong: sl,
            nha_san_xuat: '',
            cong_ty,
            kho: '',
            mo_ta
          });
        });

        this.pendingExcelItems = parsed;
        const wrap = document.getElementById('excel-preview-wrap');
        const countEl = document.getElementById('excel-preview-count');
        const tbody = document.getElementById('excel-preview-tbody');
        if (parsed.length === 0) {
          if (wrap) wrap.style.display = 'none';
          this.alert('excel-modal-alert', 'Không tìm thấy dòng vật tư hợp lệ trong file Excel. Hãy kiểm tra tiêu đề cột (Mã vật tư, Tên vật tư...).');
          return;
        }
        if (countEl) countEl.textContent = `${parsed.length} vật tư hợp lệ`;
        if (tbody) {
          tbody.innerHTML = parsed.map((it, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><code>${it.ma_vat_tu}</code></td>
              <td style="font-weight:600;">${it.ten_vat_tu}</td>
              <td>${it.don_vi_tinh}</td>
              <td><strong>${it.so_luong}</strong></td>
              <td>${it.cong_ty}</td>
            </tr>
          `).join('');
        }
        if (wrap) wrap.style.display = 'block';
      } catch (err) {
        this.alert('excel-modal-alert', 'Không thể đọc file Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  },

  async confirmImportExcel() {
    if (!this.isAdmin()) return;
    if (!this.pendingExcelItems || this.pendingExcelItems.length === 0) {
      this.alert('excel-modal-alert', 'Vui lòng chọn file Excel có dữ liệu vật tư hợp lệ trước khi tải lên');
      return;
    }
    try {
      try {
        const res = await this.api('/inventory/bulk', {
          method: 'POST',
          body: JSON.stringify({ items: this.pendingExcelItems })
        });
        this.closeModal('modal-inv-excel');
        await this.loadInventory();
        this.alert('inv-alert', `✅ Đã tải lên Excel thành công: Thêm mới ${res.inserted || 0} vật tư, cập nhật ${res.updated || 0} vật tư!`, 'success');
        return;
      } catch (_) {
        // Fallback tự động nếu Backend chưa khởi động lại để nhận route /bulk mới
        const existingMap = {};
        (this.allInventoryCache || []).forEach(x => { existingMap[x.ma_vat_tu] = true; });
        let inserted = 0;
        let updated = 0;
        for (const it of this.pendingExcelItems) {
          const payload = { ...it, gia_nhap: 0 };
          if (existingMap[it.ma_vat_tu]) {
            await this.api(`/inventory/${encodeURIComponent(it.ma_vat_tu)}`, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
            updated++;
          } else {
            await this.api('/inventory/', {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            inserted++;
          }
        }
        this.closeModal('modal-inv-excel');
        await this.loadInventory();
        this.alert('inv-alert', `✅ Đã tải lên danh sách Excel thành công: Thêm mới ${inserted} vật tư, cập nhật ${updated} vật tư!`, 'success');
      }
    } catch (e) {
      this.alert('excel-modal-alert', e.message);
    }
  },

  // ---------- Chức năng Admin: Tổng hợp & Xuất danh sách vật tư ----------
  async openExportSummaryModal() {
    if (!this.isAdmin()) {
      alert('Chức năng này chỉ dành cho tài khoản Quản trị viên (Admin).');
      return;
    }
    await this.loadInventory();
    this.renderSummaryModalTable();
    this.openModal('modal-inv-summary');
  },

  getAggregatedSummaryRows() {
    const movStats = {};
    (this.movementsCache || []).forEach(m => {
      if (!movStats[m.ma_vat_tu]) movStats[m.ma_vat_tu] = { nhap: 0, xuat: 0 };
      if (m.loai === 'nhap') movStats[m.ma_vat_tu].nhap += (parseInt(m.so_luong) || 0);
      if (m.loai === 'xuat') movStats[m.ma_vat_tu].xuat += (parseInt(m.so_luong) || 0);
    });

    const q = this.normalizeText(document.getElementById('sum-search-input')?.value || '');
    const cty = document.getElementById('sum-company-filter')?.value || '';
    const status = document.getElementById('sum-status-filter')?.value || 'all';

    return (this.allInventoryCache || []).map(it => {
      const st = movStats[it.ma_vat_tu] || { nhap: 0, xuat: 0 };
      return {
        ...it,
        tong_nhap: st.nhap,
        tong_xuat: st.xuat
      };
    }).filter(r => {
      if (cty && r.cong_ty !== cty) return false;
      if (status === 'low' && (r.so_luong || 0) > 5) return false;
      if (status === 'active_mov' && r.tong_nhap === 0 && r.tong_xuat === 0) return false;
      if (!q) return true;
      const hay = this.normalizeText(`${r.ma_vat_tu} ${r.ten_vat_tu} ${r.nha_san_xuat || ''} ${r.kho || ''}`);
      return hay.includes(q);
    });
  },

  renderSummaryModalTable() {
    const rows = this.getAggregatedSummaryRows();
    const totalItems = rows.length;
    const totalStock = rows.reduce((s, x) => s + (x.so_luong || 0), 0);
    const totalIn = rows.reduce((s, x) => s + (x.tong_nhap || 0), 0);
    const totalOut = rows.reduce((s, x) => s + (x.tong_xuat || 0), 0);

    const kpiEl = document.getElementById('sum-kpi-cards');
    if (kpiEl) {
      kpiEl.innerHTML = `
        <div class="stat" style="padding:14px 16px;">
          <div class="stat-content">
            <div class="value" style="font-size:1.5rem;">${totalItems}</div>
            <div class="label">Danh mục vật tư</div>
          </div>
        </div>
        <div class="stat" style="padding:14px 16px;">
          <div class="stat-content">
            <div class="value" style="font-size:1.5rem; color:#1d4ed8;">${totalStock}</div>
            <div class="label">Tổng số lượng tồn</div>
          </div>
        </div>
        <div class="stat" style="padding:14px 16px;">
          <div class="stat-content">
            <div class="value" style="font-size:1.5rem; color:#047857;">+${totalIn}</div>
            <div class="label">Tổng lượng đã Nhập</div>
          </div>
        </div>
        <div class="stat" style="padding:14px 16px;">
          <div class="stat-content">
            <div class="value" style="font-size:1.5rem; color:#b91c1c;">-${totalOut}</div>
            <div class="label">Tổng lượng đã Xuất</div>
          </div>
        </div>
      `;
    }

    const tbody = document.getElementById('sum-tbody');
    if (!tbody) return;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748b;">Không có vật tư nào trong bộ lọc tổng hợp</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><code>${r.ma_vat_tu}</code></td>
        <td style="font-weight:600;">${r.ten_vat_tu}</td>
        <td>${r.don_vi_tinh || '-'}</td>
        <td>${r.cong_ty}</td>
        <td style="color:#047857; font-weight:700;">+${r.tong_nhap}</td>
        <td style="color:#b91c1c; font-weight:700;">-${r.tong_xuat}</td>
        <td><strong>${r.so_luong}</strong> ${r.so_luong <= 5 ? '<span class="badge bg-danger">Sắp hết</span>' : ''}</td>
      </tr>
    `).join('');
  },

  exportInventorySummaryExcel() {
    if (!this.isAdmin()) return;
    if (typeof XLSX === 'undefined') {
      alert('Thư viện xuất Excel chưa sẵn sàng, vui lòng tải lại trang.');
      return;
    }
    const rows = this.getAggregatedSummaryRows();
    const sheet1Data = rows.map((r, idx) => ({
      'STT': idx + 1,
      'Mã vật tư': r.ma_vat_tu,
      'Tên vật tư': r.ten_vat_tu,
      'Đơn vị tính': r.don_vi_tinh || '',
      'Công ty': r.cong_ty || '',
      'Tổng đã Nhập': r.tong_nhap || 0,
      'Tổng đã Xuất': r.tong_xuat || 0,
      'Số lượng Tồn hiện tại': r.so_luong || 0,
      'Trạng thái tồn': (r.so_luong || 0) <= 5 ? 'Sắp hết (Cần bổ sung)' : 'Đủ tồn kho',
      'Mô tả kỹ thuật': r.mo_ta || ''
    }));

    const itemMap = {};
    (this.allInventoryCache || []).forEach(it => { itemMap[it.ma_vat_tu] = it; });
    const sheet2Data = (this.movementsCache || []).map((m, idx) => {
      const it = itemMap[m.ma_vat_tu] || {};
      const actor = this.parseMovementActor(m.nguoi_thuc_hien);
      return {
        'STT': idx + 1,
        'Thời gian': m.ngay_thuc_hien || '',
        'Loại phiếu': m.loai === 'nhap' ? 'Nhập kho' : 'Xuất kho',
        'Mã vật tư': m.ma_vat_tu,
        'Tên vật tư': m.ten_vat_tu || it.ten_vat_tu || '',
        'Đơn vị tính': m.don_vi_tinh || it.don_vi_tinh || '',
        'Số lượng': m.so_luong || 0,
        'Tài khoản thực hiện': actor.username,
        'Người thực hiện': actor.fullName,
        'Lý do / Ghi chú': m.ghi_chu || ''
      };
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
    XLSX.utils.book_append_sheet(wb, ws1, 'Tong_Hop_Vat_Tu');
    if (sheet2Data.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
      XLSX.utils.book_append_sheet(wb, ws2, 'Lich_Su_Nhap_Xuat');
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Bao_Cao_Tong_Hop_Vat_Tu_Kho_${dateStr}.xlsx`);
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
