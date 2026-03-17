// =============================================
// STATE & GLOBALS
// =============================================
let currentPage = 'dashboard';
let currentTipeTransaksi = 'MASUK';
let scannerRunning = false;
let miniScannerRunning = false;
let currentScanResult = null;
let allProdukData = [];
let deleteTargetId = '';
let lokasiData = [];

// Variabel global untuk Html5Qrcode
let html5QrCode = null;
let miniHtml5QrCode = null;

// MASUKKAN URL WEB APP GOOGLE APPS SCRIPT ANDA DI SINI
const API_URL = "https://script.google.com/macros/s/AKfycbx1KNiotqJiFFscBzEe-ozBA_QEgBX111BtFbySWPgZTtmGWPnRFh4TO-a6M1khcKxg/exec"; 

// Helper untuk menggantikan google.script.run
function callAPI(action, payload = null) {
  return fetch(API_URL, {
    method: 'POST',
    // Menggunakan text/plain untuk menghindari error CORS Preflight (OPTIONS) dari browser
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
    body: JSON.stringify({ action: action, payload: payload })
  })
  .then(response => response.json());
}

// =============================================
// INIT — dipanggil dari index.html setelah semua include selesai
// =============================================
function initApp() {
  updateClock();
  setInterval(updateClock, 1000);
  
  const d = new Date();
  document.getElementById('currentDate').textContent = d.toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  
  loadDashboard();
  initSheets();

  // Modal backdrop: klik di luar modal untuk menutup
  document.querySelectorAll('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', function(e) {
      if (e.target === this) {
        closeModal(this.id);
      }
    });
  });
}

function initSheets() {
  callAPI('initSheets').catch(console.error);
}

function updateClock() {
  const now = new Date();
  const t = now.toLocaleTimeString('id-ID');
  document.getElementById('topbarTime').textContent = t;
}

// =============================================
// NAVIGATION
// =============================================
function showPage(page, navItem) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  document.getElementById('page-' + page).classList.add('active');
  
  if (navItem) navItem.classList.add('active');
  else {
    // Find matching nav item
    document.querySelectorAll('.nav-item').forEach(n => {
      if (n.getAttribute('onclick') && n.getAttribute('onclick').includes("'" + page + "'")) {
        n.classList.add('active');
      }
    });
  }
  
  currentPage = page;
  const titles = {
    dashboard: 'DASHBOARD', scan: 'SCAN BARANG', masuk: 'BARANG MASUK',
    keluar: 'BARANG KELUAR', riwayat: 'RIWAYAT TRANSAKSI', produk: 'DATA PRODUK', lokasi: 'PETA RAK'
  };
  document.getElementById('topbarTitle').textContent = titles[page] || page.toUpperCase();

  // Stop scanner if leaving scan page
  if (page !== 'scan' && scannerRunning) stopScanner();

  // Load page data
  if (page === 'produk') loadProduk();
  else if (page === 'masuk') loadRiwayat('MASUK');
  else if (page === 'keluar') loadRiwayat('KELUAR');
  else if (page === 'riwayat') loadAllRiwayat();
  else if (page === 'lokasi') loadLokasi();
  else if (page === 'dashboard') loadDashboard();
  
  closeSidebar();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

// =============================================
// LOADING & TOAST
// =============================================
function showLoading() { document.getElementById('loadingOverlay').classList.add('show'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.remove('show'); }

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = '<span>' + icons[type] + '</span><span>' + message + '</span>';
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// =============================================
// DASHBOARD
// =============================================
function loadDashboard() {
  showLoading();
  callAPI('getDashboardStats')
    .then(data => {
      hideLoading();
      if (!data.success) return;
      document.getElementById('stat-total-produk').textContent = data.totalProduk;
      document.getElementById('stat-masuk').textContent = data.masukHariIni;
      document.getElementById('stat-keluar').textContent = data.keluarHariIni;
      document.getElementById('stat-stok-rendah').textContent = data.stokRendah;

      const tbody = document.getElementById('dashboard-transaksi-tbody');
      if (!data.transaksiTerbaru || data.transaksiTerbaru.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state" style="text-align:center;padding:30px;color:var(--text3)">Belum ada transaksi</td></tr>';
        return;
      }
      tbody.innerHTML = data.transaksiTerbaru.map(t => `
        <tr>
          <td style="color:var(--text3);font-size:12px">${t.timestamp}</td>
          <td>${t.namaProduk}</td>
          <td class="barcode-cell">${t.barcode}</td>
          <td><span class="badge ${t.tipe==='MASUK'?'badge-green':'badge-red'}">${t.tipe}</span></td>
          <td>${t.jumlah}</td>
          <td style="font-size:12px">${t.rak?'Rak '+t.rak+' L'+t.lantai+' B'+t.baris:'—'}</td>
        </tr>
      `).join('');
    })
    .catch(err => { hideLoading(); showToast('Gagal memuat dashboard: ' + err, 'error'); });
}


// =============================================
// SCANNER — VERSI MODERN (Html5-Qrcode)
// =============================================

function startScanner() {
  document.getElementById('scanIdle').style.display = 'none';
  document.getElementById('scannerOverlay').style.display = 'block';
  document.getElementById('scannerBox').classList.add('active');
  document.getElementById('btnStartScan').disabled = true;
  document.getElementById('btnStopScan').disabled = false;

  html5QrCode = new Html5Qrcode("scanner-viewport");
  scannerRunning = true;

  const config = {
    fps: 15,
    qrbox: { width: 300, height: 150 }, // Bentuk horizontal cocok untuk kardus
    formatsToSupport: [
      Html5QrcodeSupportedFormats.ITF,      // Kardus (Aqua, Roma, dll)
      Html5QrcodeSupportedFormats.EAN_13,   // Produk Satuan
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39
    ]
  };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    (decodedText, decodedResult) => {
      // Konsensus tercapai otomatis oleh library!
      showScanIndicator('scanIndicator');
      playBeep();
      stopScanner(); // Matikan kamera agar tidak scan ganda

      const cleanCode = decodedText.trim().replace(/\s+/g, '');
      document.getElementById('manualBarcode').value = cleanCode;
      processBarcode(cleanCode);
    },
    (errorMessage) => {
      // Abaikan error per frame (normal saat mencari barcode)
    }
  ).catch((err) => {
    showToast('Gagal mengakses kamera: ' + err, 'error');
    stopScanner();
  });
}

function stopScanner() {
  if (scannerRunning && html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      resetScannerUI();
    }).catch((err) => {
      console.error("Gagal menghentikan scanner:", err);
      resetScannerUI();
    });
    scannerRunning = false;
  } else {
    resetScannerUI();
  }
}

function resetScannerUI() {
  document.getElementById('scanner-viewport').innerHTML = '';
  document.getElementById('scannerOverlay').style.display = 'none';
  document.getElementById('scannerBox').classList.remove('active');
  document.getElementById('scanIdle').style.display = 'block';
  document.getElementById('btnStartScan').disabled = false;
  document.getElementById('btnStopScan').disabled = true;
}

function showScanIndicator(id) {
  const el = document.getElementById(id);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1500);
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch(e) {}
}

// =============================================
// BARCODE PROCESSING
// =============================================
function processBarcode(barcode) {
  if (!barcode || barcode.trim() === '') {
    showToast('Masukkan kode barcode terlebih dahulu', 'error');
    return;
  }
  barcode = barcode.trim();

  showLoading();
  // Fetch produk & semua lokasi secara paralel
  Promise.all([
    callAPI('getProdukByBarcode', barcode),
    callAPI('getSemuaLokasi')
  ])
    .then(([produkResult, lokasiResult]) => {
      hideLoading();
      const semuaLokasi = lokasiResult.data || [];
      if (produkResult.success) {
        // Filter lokasi hanya milik barcode ini
        const lokasiProduk = semuaLokasi.filter(l => String(l.barcode) === String(barcode));
        showResultFound(produkResult.data, lokasiProduk);
      } else {
        showResultNotFound(barcode);
      }
    })
    .catch(err => {
      hideLoading();
      showToast('Error: ' + err, 'error');
    });
}

function showResultFound(produk, lokasiProduk = []) {
  currentScanResult = produk;

  document.getElementById('resultEmpty').style.display = 'none';
  document.getElementById('resultNotFound').style.display = 'none';
  document.getElementById('resultFound').classList.add('show');

  // Info dasar
  document.getElementById('resNama').textContent = produk.nama;
  document.getElementById('resBarcode').textContent = produk.barcode;
  document.getElementById('resKategori').textContent = produk.kategori || 'Umum';
  document.getElementById('resSatuan').textContent = produk.satuan || 'pcs';
  document.getElementById('resDeskripsi').textContent = produk.deskripsi || '—';

  // Stok dengan indikator warna — hitung dari total semua lokasi jika ada
  const totalStok = lokasiProduk.length > 0
    ? lokasiProduk.reduce((sum, l) => sum + (parseInt(l.jumlah) || 0), 0)
    : produk.stok;

  const stokEl = document.getElementById('resStok');
  stokEl.textContent = totalStok;
  stokEl.className = 'meta-value ' + (totalStok <= 0 ? 'stok-warning' : totalStok <= 5 ? 'stok-low' : 'stok-ok');

  // Badge status stok
  const stokBadgeEl = document.getElementById('resStokBadge');
  if (totalStok <= 0) {
    stokBadgeEl.textContent = 'HABIS';
    stokBadgeEl.className = 'badge badge-red';
  } else if (totalStok <= 5) {
    stokBadgeEl.textContent = 'STOK RENDAH';
    stokBadgeEl.className = 'badge badge-yellow';
  } else {
    stokBadgeEl.textContent = 'TERSEDIA';
    stokBadgeEl.className = 'badge badge-green';
  }

  // Render tabel multi-lokasi
  const lokasiContainer = document.getElementById('resLokasiContainer');
  if (lokasiProduk.length === 0) {
    lokasiContainer.innerHTML = `
      <div style="text-align:center;padding:14px 0;color:var(--text3);font-size:13px">
        <span style="font-size:28px;display:block;margin-bottom:6px;opacity:0.4">📍</span>
        Belum ada data lokasi rak
      </div>`;
  } else {
    lokasiContainer.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#eef0f6">
            <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1.5px;color:var(--text2);font-family:var(--font-display);font-weight:700;text-transform:uppercase">Rak</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1.5px;color:var(--text2);font-family:var(--font-display);font-weight:700;text-transform:uppercase">Lantai</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1.5px;color:var(--text2);font-family:var(--font-display);font-weight:700;text-transform:uppercase">Baris</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;letter-spacing:1.5px;color:var(--text2);font-family:var(--font-display);font-weight:700;text-transform:uppercase">Jumlah</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1.5px;color:var(--text2);font-family:var(--font-display);font-weight:700;text-transform:uppercase">Update</th>
          </tr>
        </thead>
        <tbody>
          ${lokasiProduk.map((l, i) => `
            <tr style="border-top:1px solid var(--border);${i === 0 ? 'background:rgba(234,108,0,0.04)' : ''}">
              <td style="padding:8px 10px"><span style="background:var(--accent);color:#fff;border-radius:5px;padding:2px 8px;font-family:var(--font-display);font-weight:700;font-size:13px">R${l.rak}</span></td>
              <td style="padding:8px 10px;font-weight:600">Lantai ${l.lantai}</td>
              <td style="padding:8px 10px;font-weight:600">Baris ${l.baris}</td>
              <td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);font-weight:700;color:var(--accent)">${l.jumlah}</td>
              <td style="padding:8px 10px;font-size:11px;color:var(--text3)">${l.lastUpdated || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
        ${lokasiProduk.length > 1 ? `
        <tfoot>
          <tr style="border-top:2px solid var(--border);background:#f7f8fc">
            <td colspan="3" style="padding:8px 10px;font-size:11px;color:var(--text3);font-family:var(--font-display);font-weight:700;letter-spacing:0.5px">${lokasiProduk.length} LOKASI TERDAFTAR</td>
            <td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);font-weight:700">${lokasiProduk.reduce((sum, l) => sum + (parseInt(l.jumlah) || 0), 0)}</td>
            <td></td>
          </tr>
        </tfoot>` : ''}
      </table>`;
  }

  // Pre-fill lokasi dari data produk (lokasi utama)
  if (produk.rak) {
    document.getElementById('txRak').value = produk.rak;
    document.getElementById('txLantai').value = produk.lantai;
    document.getElementById('txBaris').value = produk.baris;
  }

  // Update button teks & warna
  const btn = document.getElementById('btnTransaksi');
  btn.textContent = currentTipeTransaksi === 'MASUK' ? '✓ Konfirmasi Masuk' : '✓ Konfirmasi Keluar';
  btn.className = 'btn ' + (currentTipeTransaksi === 'MASUK' ? 'btn-success' : 'btn-danger');

  // Show/hide lokasi section
  document.getElementById('lokasiMasukSection').style.display = currentTipeTransaksi === 'MASUK' ? 'block' : 'none';
}

function showResultNotFound(barcode) {
  currentScanResult = null;
  document.getElementById('resultEmpty').style.display = 'none';
  document.getElementById('resultFound').classList.remove('show');
  document.getElementById('resultNotFound').style.display = 'block';
  document.getElementById('notFoundBarcode').textContent = barcode;
  // Pre-fill field barcode di panel tidak-ditemukan
  const quickBarcodeEl = document.getElementById('quickAddBarcode');
  if (quickBarcodeEl) quickBarcodeEl.value = barcode;
  window._pendingBarcode = barcode;
}

function showTambahProduk() {
  openModalTambahProduk();
  if (window._pendingBarcode) {
    document.getElementById('produkBarcode').value = window._pendingBarcode;
  }
}

function quickAddProduk() {
  const nama = document.getElementById('quickAddNama').value.trim();
  const barcode = document.getElementById('quickAddBarcode').value.trim();
  const kategori = document.getElementById('quickAddKategori').value.trim();
  const satuan = document.getElementById('quickAddSatuan').value;
  if (!nama) { showToast('Nama produk wajib diisi!', 'error'); return; }
  // Isi modal produk lalu buka
  document.getElementById('modalProdukTitle').textContent = 'TAMBAH PRODUK';
  document.getElementById('editProdukId').value = '';
  document.getElementById('produkBarcode').value = barcode;
  document.getElementById('produkNama').value = nama;
  document.getElementById('produkKategori').value = kategori;
  document.getElementById('produkSatuan').value = satuan;
  document.getElementById('produkStok').value = '0';
  document.getElementById('produkDeskripsi').value = '';
  document.getElementById('produkRak').value = '';
  document.getElementById('produkLantai').value = '';
  document.getElementById('produkBaris').value = '';
  openModal('modalProduk');
}

// =============================================
// TIPE TRANSAKSI
// =============================================
function setTipeTransaksi(tipe) {
  currentTipeTransaksi = tipe;
  document.getElementById('tab-masuk').classList.toggle('active', tipe === 'MASUK');
  document.getElementById('tab-keluar').classList.toggle('active', tipe === 'KELUAR');
  
  const badge = document.getElementById('scan-tipe-badge');
  badge.textContent = tipe;
  badge.className = 'badge ' + (tipe === 'MASUK' ? 'badge-green' : 'badge-red');

  document.getElementById('lokasiMasukSection').style.display = tipe === 'MASUK' ? 'block' : 'none';

  if (currentScanResult) {
    const btn = document.getElementById('btnTransaksi');
    btn.textContent = tipe === 'MASUK' ? '✓ Konfirmasi Masuk' : '✓ Konfirmasi Keluar';
    btn.className = 'btn ' + (tipe === 'MASUK' ? 'btn-success' : 'btn-danger');
  }
}

// =============================================
// TRANSAKSI
// =============================================
function submitTransaksi() {
  if (!currentScanResult) { showToast('Scan atau cari produk terlebih dahulu', 'error'); return; }
  const jumlah = parseInt(document.getElementById('txJumlah').value);
  if (!jumlah || jumlah <= 0) { showToast('Masukkan jumlah yang valid', 'error'); return; }

  const rak = document.getElementById('txRak').value;
  const lantai = document.getElementById('txLantai').value;
  const baris = document.getElementById('txBaris').value;

  if (currentTipeTransaksi === 'MASUK' && (!rak || !lantai || !baris)) {
    showToast('Pilih lokasi rak, lantai, dan baris untuk barang masuk', 'error');
    return;
  }
  if (currentTipeTransaksi === 'KELUAR' && jumlah > currentScanResult.stok) {
    if (!confirm(`Stok saat ini: ${currentScanResult.stok}. Jumlah keluar: ${jumlah}. Stok akan menjadi ${currentScanResult.stok - jumlah}. Lanjutkan?`)) return;
  }

  showLoading();
  const data = {
    barcode: currentScanResult.barcode,
    namaProduk: currentScanResult.nama,
    tipe: currentTipeTransaksi,
    jumlah: jumlah,
    rak: rak, lantai: lantai, baris: baris,
    catatan: document.getElementById('txCatatan').value,
    operator: 'Admin'
  };

  callAPI('catatTransaksi', data)
    .then(result => {
      hideLoading();
      if (result.success) {
        showToast('Transaksi berhasil dicatat!', 'success');
        playBeep();
        // Reset form
        document.getElementById('txJumlah').value = 1;
        document.getElementById('txCatatan').value = '';
        document.getElementById('txRak').value = '';
        document.getElementById('txLantai').value = '';
        document.getElementById('txBaris').value = '';
        document.getElementById('resultFound').classList.remove('show');
        document.getElementById('resultEmpty').style.display = 'block';
        document.getElementById('manualBarcode').value = '';
        currentScanResult = null;
        loadDashboard();
      } else { showToast('Gagal: ' + result.message, 'error'); }
    })
    .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
}

// =============================================
// PRODUK CRUD
// =============================================
function loadProduk() {
  showLoading();
  callAPI('getAllProduk')
    .then(result => {
      hideLoading();
      if (!result.success) { showToast('Gagal memuat produk', 'error'); return; }
      allProdukData = result.data;
      renderProdukTable(allProdukData);
      // Isi dropdown kategori dari data yang ada
      buildKategoriFilter(allProdukData);
    })
    .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
}

function buildKategoriFilter(data) {
  const select = document.getElementById('filterKategori');
  if (!select) return;
  // Kumpulkan kategori unik, buang yang kosong
  const kategoriSet = new Set(
    data.map(p => p.kategori).filter(k => k && k.trim() !== '' && k !== '—')
  );
  const currentVal = select.value;
  select.innerHTML = '<option value="">Semua Kategori</option>';
  [...kategoriSet].sort().forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    select.appendChild(opt);
  });
  // Pertahankan pilihan sebelumnya jika masih ada
  if (currentVal) select.value = currentVal;
}

function renderProdukTable(data) {
  const tbody = document.getElementById('produk-tbody');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📦</div><p>Belum ada produk. Tambahkan produk pertama!</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = data.map(p => {
    const stokClass = p.stok <= 0 ? 'stok-warning' : p.stok <= 5 ? 'stok-low' : 'stok-ok';
    const lokasi = p.rak ? `R${p.rak} L${p.lantai} B${p.baris}` : '<span style="color:var(--text3)">—</span>';
    return `
      <tr>
        <td class="barcode-cell">${p.barcode}</td>
        <td><strong>${p.nama}</strong><div style="font-size:11px;color:var(--text3)">${p.deskripsi||''}</div></td>
        <td><span class="badge badge-blue">${p.kategori||'—'}</span></td>
        <td><span class="stok-badge ${stokClass}">${p.stok}</span></td>
        <td style="color:var(--text3)">${p.satuan}</td>
        <td style="font-size:12px;font-family:var(--font-mono)">${lokasi}</td>
        <td>
          <div class="td-actions">
            <button class="btn btn-outline btn-sm btn-icon" onclick="editProdukById('${p.id}')" title="Edit">✏️</button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="hapusProdukModal('${p.id}','${p.nama.replace(/'/g,'\\\'')}')" title="Hapus">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ── FILTER: dipanggil setiap kali search atau kategori berubah ──
function filterProdukTable() {
  const q = document.getElementById('searchProduk').value.toLowerCase().trim();
  const kategori = document.getElementById('filterKategori')
    ? document.getElementById('filterKategori').value
    : '';

  const filtered = allProdukData.filter(p => {
    const matchText = !q ||
      p.nama.toLowerCase().includes(q) ||
      p.barcode.toLowerCase().includes(q) ||
      (p.kategori && p.kategori.toLowerCase().includes(q)) ||
      (p.deskripsi && p.deskripsi.toLowerCase().includes(q));

    const matchKategori = !kategori || p.kategori === kategori;

    return matchText && matchKategori;
  });

  renderProdukTable(filtered);

  // Tampilkan info jumlah hasil filter
  const infoEl = document.getElementById('produkFilterInfo');
  if (infoEl) {
    const isFiltering = q || kategori;
    if (isFiltering) {
      infoEl.style.display = 'block';
      infoEl.innerHTML = `Menampilkan <strong>${filtered.length}</strong> dari <strong>${allProdukData.length}</strong> produk` +
        (kategori ? ` · Kategori: <strong>${kategori}</strong>` : '') +
        (q ? ` · Kata kunci: <strong>"${q}"</strong>` : '') +
        (filtered.length < allProdukData.length
          ? ` &nbsp;<a href="#" onclick="resetFilterProduk();return false;" style="color:var(--accent);font-weight:600">✕ Reset filter</a>`
          : '');
    } else {
      infoEl.style.display = 'none';
    }
  }
}

function resetFilterProduk() {
  document.getElementById('searchProduk').value = '';
  const sel = document.getElementById('filterKategori');
  if (sel) sel.value = '';
  filterProdukTable();
}

function openModalTambahProduk() {
  document.getElementById('modalProdukTitle').textContent = 'TAMBAH PRODUK';
  document.getElementById('editProdukId').value = '';
  document.getElementById('produkBarcode').value = '';
  document.getElementById('produkNama').value = '';
  document.getElementById('produkKategori').value = '';
  document.getElementById('produkSatuan').value = 'pcs';
  document.getElementById('produkStok').value = '0';
  document.getElementById('produkDeskripsi').value = '';
  document.getElementById('produkRak').value = '';
  document.getElementById('produkLantai').value = '';
  document.getElementById('produkBaris').value = '';
  openModal('modalProduk');
}

function editProdukById(id) {
  const p = allProdukData.find(x => x.id === id);
  if (!p) return;
  document.getElementById('modalProdukTitle').textContent = 'EDIT PRODUK';
  document.getElementById('editProdukId').value = p.id;
  document.getElementById('produkBarcode').value = p.barcode;
  document.getElementById('produkNama').value = p.nama;
  document.getElementById('produkKategori').value = p.kategori || '';
  document.getElementById('produkSatuan').value = p.satuan || 'pcs';
  document.getElementById('produkStok').value = p.stok || 0;
  document.getElementById('produkDeskripsi').value = p.deskripsi || '';
  document.getElementById('produkRak').value = p.rak || '';
  document.getElementById('produkLantai').value = p.lantai || '';
  document.getElementById('produkBaris').value = p.baris || '';
  openModal('modalProduk');
}

function editProdukFromScan() {
  if (!currentScanResult) return;
  const p = currentScanResult;
  // Redirect ke produk page dan edit
  showPage('produk', null);
  setTimeout(() => {
    const found = allProdukData.find(x => x.barcode === p.barcode);
    if (found) editProdukById(found.id);
  }, 500);
}

function saveProduk() {
  const barcode = document.getElementById('produkBarcode').value.trim();
  const nama = document.getElementById('produkNama').value.trim();
  
  if (!barcode || !nama) { showToast('Barcode dan nama produk wajib diisi!', 'error'); return; }

  const id = document.getElementById('editProdukId').value;
  const data = {
    id, barcode, nama,
    kategori: document.getElementById('produkKategori').value,
    satuan: document.getElementById('produkSatuan').value,
    stok: parseInt(document.getElementById('produkStok').value) || 0,
    deskripsi: document.getElementById('produkDeskripsi').value,
    rak: document.getElementById('produkRak').value,
    lantai: document.getElementById('produkLantai').value,
    baris: document.getElementById('produkBaris').value
  };

  showLoading();
  const fn = id ? 'editProduk' : 'tambahProduk'; // Menentukan aksi
  
  callAPI(fn, data)
    .then(result => {
      hideLoading();
      if (result.success) {
        showToast(result.message, 'success');
        closeModal('modalProduk');
        loadProduk();
      } else { showToast('Gagal: ' + result.message, 'error'); }
    })
    .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
}

function hapusProdukModal(id, nama) {
  deleteTargetId = id;
  document.getElementById('hapusProdukNama').textContent = nama;
  openModal('modalHapus');
}

function konfirmasiHapus() {
  showLoading();
  callAPI('hapusProduk', deleteTargetId)
    .then(result => {
      hideLoading();
      closeModal('modalHapus');
      if (result.success) {
        showToast('Produk berhasil dihapus', 'success');
        loadProduk();
      } else { showToast('Gagal: ' + result.message, 'error'); }
    })
    .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
}

// =============================================
// RIWAYAT
// =============================================
function loadRiwayat(tipe) {
  showLoading();
  callAPI('getTransaksi', { tipe: tipe })
    .then(result => {
      hideLoading();
      const tbodyId = tipe === 'MASUK' ? 'masuk-tbody' : 'keluar-tbody';
      renderRiwayatTable(tbodyId, result.data || []);
    })
    .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
}

function loadAllRiwayat() {
  const tipe = document.getElementById('filterTipe').value;
  showLoading();
  callAPI('getTransaksi', tipe ? { tipe: tipe } : {})
    .then(result => {
      hideLoading();
      const data = result.data || [];
      const tbody = document.getElementById('riwayat-tbody');
      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">Belum ada transaksi</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(t => `
        <tr>
          <td style="font-size:12px;color:var(--text3)">${t.timestamp}</td>
          <td><span class="badge ${t.tipe==='MASUK'?'badge-green':'badge-red'}">${t.tipe}</span></td>
          <td class="barcode-cell">${t.barcode}</td>
          <td>${t.namaProduk}</td>
          <td><strong>${t.jumlah}</strong></td>
          <td style="font-size:12px">${t.rak?'R'+t.rak+' L'+t.lantai+' B'+t.baris:'—'}</td>
          <td style="color:var(--text3)">${t.operator}</td>
          <td style="color:var(--text3);font-size:12px">${t.catatan||''}</td>
        </tr>
      `).join('');
    })
    .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
}

function renderRiwayatTable(tbodyId, data) {
  const tbody = document.getElementById(tbodyId);
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">Belum ada transaksi</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(t => `
    <tr>
      <td style="font-size:12px;color:var(--text3)">${t.timestamp}</td>
      <td class="barcode-cell">${t.barcode}</td>
      <td>${t.namaProduk}</td>
      <td><strong>${t.jumlah}</strong></td>
      <td style="font-size:12px">${t.rak?'R'+t.rak+' L'+t.lantai+' B'+t.baris:'—'}</td>
      <td style="color:var(--text3);font-size:12px">${t.catatan||''}</td>
      <td style="color:var(--text3)">${t.operator}</td>
    </tr>
  `).join('');
}

// =============================================
// LOKASI / RAK
// =============================================
function loadLokasi() {
  showLoading();
  callAPI('getSemuaLokasi')
    .then(result => {
      hideLoading();
      lokasiData = result.data || [];
      renderRakGrid();
    })
    .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
}

function renderRakGrid() {
  const grid = document.getElementById('rakGrid');
  let html = '';

  for (let r = 1; r <= 8; r++) {
    const rakItems = lokasiData.filter(l => l.rak == r);
    const occupied = rakItems.length;
    const capacity = 3 * 4; // 3 lantai × 4 baris
    
    html += `<div class="rak-card">
      <div class="rak-header">
        <span>🗄️ RAK ${r}</span>
        <span style="font-size:11px;color:var(--text3)">${occupied}/${capacity}</span>
      </div>`;

    for (let lt = 1; lt <= 3; lt++) {
      html += `<div class="lantai-group">
        <div class="lantai-label">LANTAI ${lt}</div>
        <div class="baris-row">`;
      
      for (let b = 1; b <= 4; b++) {
        const item = lokasiData.find(l => l.rak == r && l.lantai == lt && l.baris == b);
        if (item) {
          html += `<div class="baris-slot occupied" onclick="showLokasiDetail(${r},${lt},${b})" title="${item.namaProduk} (${item.jumlah})">B${b}</div>`;
        } else {
          html += `<div class="baris-slot empty" title="Kosong">B${b}</div>`;
        }
      }
      
      html += `</div></div>`;
    }

    html += `</div>`;
  }

  grid.innerHTML = html;
}

function showLokasiDetail(rak, lantai, baris) {
  const items = lokasiData.filter(l => l.rak == rak && l.lantai == lantai && l.baris == baris);
  
  document.getElementById('lokasiDetailTitle').textContent = `Rak ${rak} — Lantai ${lantai} — Baris ${baris}`;
  
  const tbody = document.getElementById('lokasiDetailTbody');
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text3)">Slot kosong</td></tr>';
  } else {
    tbody.innerHTML = items.map(i => `
      <tr>
        <td class="barcode-cell">${i.barcode}</td>
        <td>${i.namaProduk}</td>
        <td><strong>${i.jumlah}</strong></td>
        <td style="font-size:11px;color:var(--text3)">${i.lastUpdated}</td>
      </tr>
    `).join('');
  }
  
  document.getElementById('lokasiDetailPanel').style.display = 'block';
  document.getElementById('lokasiDetailPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeLokasiDetail() {
  document.getElementById('lokasiDetailPanel').style.display = 'none';
}

// =============================================
// MINI SCANNER (untuk Modal Produk & Scan Info)
// Versi Modern dengan Html5-Qrcode
// =============================================

function scanForModal() {
  window._scanInfoMode = false;
  openModal('modalMiniScan');
  setTimeout(startMiniScanner, 300);
}

function scanInfoProduk() {
  window._scanInfoMode = true;
  openModal('modalMiniScan');
  setTimeout(startMiniScanner, 300);
}

function startMiniScanner() {
  document.getElementById('miniScanIdle').style.display = 'none';

  miniHtml5QrCode = new Html5Qrcode("mini-scanner-viewport");
  miniScannerRunning = true;

  const config = {
    fps: 15,
    qrbox: { width: 250, height: 100 },
    formatsToSupport: [
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39
    ]
  };

  miniHtml5QrCode.start(
    { facingMode: "environment" },
    config,
    (decodedText, decodedResult) => {
      showScanIndicator('miniScanIndicator');
      playBeep();

      const capturedCode = decodedText.trim().replace(/\s+/g, '');
      closeMiniScanner();
      handleModalBarcode(capturedCode);
    },
    (errorMessage) => {
      // Abaikan error per frame
    }
  ).catch((err) => {
    document.getElementById('miniScanIdle').style.display = 'block';
    document.getElementById('miniScanIdle').querySelector('p').textContent = 'Gagal akses kamera';
    miniScannerRunning = false;
  });
}

function closeMiniScanner() {
  if (miniScannerRunning && miniHtml5QrCode) {
    miniHtml5QrCode.stop().then(() => {
      miniHtml5QrCode.clear();
      resetMiniScannerUI();
    }).catch(err => {
      console.error("Gagal menghentikan mini scanner:", err);
      resetMiniScannerUI();
    });
    miniScannerRunning = false;
  } else {
    resetMiniScannerUI();
  }
}

function resetMiniScannerUI() {
  const vp = document.getElementById('mini-scanner-viewport');
  if (vp) vp.innerHTML = '';
  const idle = document.getElementById('miniScanIdle');
  if (idle) idle.style.display = 'block';
  // Tutup modal langsung
  const modal = document.getElementById('modalMiniScan');
  if (modal) modal.classList.remove('show');
}

function useMiniBarcode() {
  const val = document.getElementById('miniManualBarcode').value.trim();
  if (!val) { showToast('Masukkan kode barcode', 'error'); return; }
  closeMiniScanner();
  document.getElementById('miniManualBarcode').value = '';
  handleModalBarcode(val);
}

// =============================================
// HANDLE BARCODE DARI MINI SCANNER
// =============================================
function handleModalBarcode(barcode) {
  // ── MODE SCAN INFO (dari halaman Data Produk) ──
  if (window._scanInfoMode) {
    window._scanInfoMode = false;
    showLoading();
    Promise.all([
      callAPI('getProdukByBarcode', barcode),
      callAPI('getSemuaLokasi')
    ]).then(([produkResult, lokasiResult]) => {
      hideLoading();
      const semuaLokasi = lokasiResult.data || [];

      if (produkResult.success) {
        const p = produkResult.data;
        const lokasiProduk = semuaLokasi.filter(l => String(l.barcode) === String(barcode));
        const totalStok = lokasiProduk.length > 0
          ? lokasiProduk.reduce((sum, l) => sum + (parseInt(l.jumlah) || 0), 0)
          : p.stok;
        const lokasiStr = lokasiProduk.length > 0
          ? lokasiProduk.map(l => `R${l.rak} L${l.lantai} B${l.baris} (${l.jumlah})`).join(' · ')
          : 'Belum ada lokasi';

        setTimeout(() => {
          if (confirm(
            `✅ Produk Ditemukan\n\n` +
            `Nama   : ${p.nama}\n` +
            `Stok   : ${totalStok} ${p.satuan}\n` +
            `Lokasi : ${lokasiStr}\n\n` +
            `Buka untuk diedit?`
          )) {
            editProdukById(p.id);
          }
        }, 100);

      } else {
        setTimeout(() => {
          if (confirm(`❓ Barcode ${barcode} belum terdaftar.\nTambah sebagai produk baru?`)) {
            openModalTambahProduk();
            document.getElementById('produkBarcode').value = barcode;
          }
        }, 100);
      }
    }).catch(() => hideLoading());
    return; // stop, jangan lanjut ke mode normal
  }

  // ── MODE NORMAL (dari modal Tambah/Edit Produk) ──
  document.getElementById('produkBarcode').value = barcode;

  showLoading();
  callAPI('getProdukByBarcode', barcode)
    .then(result => {
      hideLoading();
      if (result.success) {
        const p = result.data;
        // Produk sudah ada → switch ke mode Edit dan auto-fill semua field
        document.getElementById('modalProdukTitle').textContent = 'EDIT PRODUK';
        document.getElementById('editProdukId').value = p.id;
        document.getElementById('produkBarcode').value = p.barcode;
        document.getElementById('produkNama').value = p.nama;
        document.getElementById('produkKategori').value = p.kategori || '';
        document.getElementById('produkSatuan').value = p.satuan || 'pcs';
        document.getElementById('produkStok').value = p.stok || 0;
        document.getElementById('produkDeskripsi').value = p.deskripsi || '';
        document.getElementById('produkRak').value = p.rak || '';
        document.getElementById('produkLantai').value = p.lantai || '';
        document.getElementById('produkBaris').value = p.baris || '';
        showToast('Produk ditemukan — data terisi otomatis', 'info');
      }
    })
    .catch(() => hideLoading());
}

// =============================================
// MODAL HELPERS
// =============================================
function openModal(id) {
  document.getElementById(id).classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
  
  if (id === 'modalMiniScan') {
    if (miniScannerRunning && miniHtml5QrCode) {
      miniHtml5QrCode.stop().then(() => {
        miniHtml5QrCode.clear();
        miniScannerRunning = false;
      }).catch(err => {
        console.error(err);
        miniScannerRunning = false;
      });
    } else {
      miniScannerRunning = false;
    }
    const vp = document.getElementById('mini-scanner-viewport');
    if (vp) vp.innerHTML = '';
    const idle = document.getElementById('miniScanIdle');
    if (idle) idle.style.display = 'block';
  }
}