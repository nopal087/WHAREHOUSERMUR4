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
let riwayatMasukData = [];
let riwayatKeluarData = [];

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
// function loadDashboard() {
//   showLoading();
//   callAPI('getDashboardStats')
//     .then(data => {
//       hideLoading();
//       if (!data.success) return;
//       document.getElementById('stat-total-produk').textContent = data.totalProduk;
//       document.getElementById('stat-masuk').textContent = data.masukHariIni;
//       document.getElementById('stat-keluar').textContent = data.keluarHariIni;
//       document.getElementById('stat-stok-rendah').textContent = data.stokRendah;

//       const tbody = document.getElementById('dashboard-transaksi-tbody');
//       if (!data.transaksiTerbaru || data.transaksiTerbaru.length === 0) {
//         tbody.innerHTML = '<tr><td colspan="6" class="empty-state" style="text-align:center;padding:30px;color:var(--text3)">Belum ada transaksi</td></tr>';
//         return;
//       }
//       tbody.innerHTML = data.transaksiTerbaru.map(t => `
//         <tr>
//           <td style="color:var(--text3);font-size:12px">${t.timestamp}</td>
//           <td>${t.namaProduk}</td>
//           <td class="barcode-cell">${t.barcode}</td>
//           <td><span class="badge ${t.tipe==='MASUK'?'badge-green':'badge-red'}">${t.tipe}</span></td>
//           <td>${t.jumlah}</td>
//           <td style="font-size:12px">${t.rak?'Rak '+t.rak+' L'+t.lantai+' B'+t.baris:'—'}</td>
//         </tr>
//       `).join('');
//     })
//     .catch(err => { hideLoading(); showToast('Gagal memuat dashboard: ' + err, 'error'); });
// }

// =============================================
// DASHBOARD (VERSI SAT-SET / CACHE FIRST)
// =============================================

// Fungsi pembantu (helper) untuk mencetak UI agar tidak duplikat kodenya
function renderDashboardUI(data) {
  document.getElementById('stat-total-produk').textContent = data.totalProduk || 0;
  document.getElementById('stat-masuk').textContent = data.masukHariIni || 0;
  document.getElementById('stat-keluar').textContent = data.keluarHariIni || 0;
  document.getElementById('stat-stok-rendah').textContent = data.stokRendah || 0;

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
}

// Fungsi utama Load Dashboard
function loadDashboard() {
  const CACHE_KEY = 'wms_cache_dashboard';
  
  // 1. CEK CACHE LOKAL: Langsung tampilkan angka terakhir yang tersimpan di HP
  const cachedData = localStorage.getItem(CACHE_KEY);
  if (cachedData) {
    try {
      renderDashboardUI(JSON.parse(cachedData));
      console.log("⚡ Dashboard dimuat instan!");
    } catch(e) {
      console.error("Gagal parse cache dashboard");
    }
  } else {
    // Jika belum pernah buka aplikasi sama sekali
    showLoading();
  }

  // 2. SINKRONISASI BACKGROUND: Ambil data statistik terbaru dari server
  callAPI('getDashboardStats')
    .then(data => {
      if (!cachedData) hideLoading();
      if (!data.success) return;
      
      // 3. UPDATE: Simpan data baru ke HP dan perbarui tampilan layar
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      renderDashboardUI(data);
    })
    .catch(err => { 
      // Jika offline, biarkan user melihat cache (jangan tampilkan loading terus)
      if (!cachedData) {
        hideLoading(); 
        showToast('Gagal memuat dashboard: ' + err, 'error'); 
      }
    });
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
// =============================================
// PROSES PENCARIAN BARCODE (DARI SCAN / MANUAL)
// =============================================
// function processBarcode(barcode) {
//   if (!barcode) return;
  
//   // Hapus karakter non-alfanumerik jika diperlukan, tapi biasanya barcode bisa mengandung huruf
//   barcode = String(barcode).trim();
  
//   if (barcode === '') {
//     showToast('Barcode tidak boleh kosong', 'error');
//     return;
//   }

//   showLoading();
  
//   // Mengambil data produk dan lokasi sekaligus agar cepat
//   Promise.all([
//     callAPI('getProdukByBarcode', barcode),
//     callAPI('getSemuaLokasi')
//   ]).then(([produkResult, lokasiResult]) => {
//     hideLoading();
//     const semuaLokasi = lokasiResult.data || [];

//     if (produkResult.success) {
//       // 1. BARCODE DITEMUKAN (PRODUK SUDAH ADA)
//       const p = produkResult.data;
//       currentScanResult = p;
      
//       document.getElementById('resultEmpty').style.display = 'none';
//       document.getElementById('resultNotFound').style.display = 'none';
      
//       const resFound = document.getElementById('resultFound');
//       resFound.classList.add('show');

//       // Tampilkan data ke layar
//       document.getElementById('resNama').textContent = p.nama;
//       document.getElementById('resBarcode').textContent = p.barcode;
//       document.getElementById('resKategori').textContent = p.kategori || 'Umum';
//       document.getElementById('resDeskripsi').textContent = p.deskripsi || '';
//       document.getElementById('resSatuan').textContent = p.satuan || 'pcs';

//       // Hitung stok total dari tabel lokasi (lebih akurat jika disebar di banyak rak)
//       const lokasiProduk = semuaLokasi.filter(l => String(l.barcode) === String(barcode));
//       const totalStok = lokasiProduk.length > 0 
//         ? lokasiProduk.reduce((sum, l) => sum + (parseInt(l.jumlah) || 0), 0)
//         : p.stok;
      
//       document.getElementById('resStok').textContent = totalStok;

//       // Pewarnaan stok
//       const stokBadge = document.getElementById('resStokBadge');
//       if (totalStok <= 0) {
//         stokBadge.textContent = 'STOK HABIS';
//         stokBadge.className = 'badge badge-red';
//         document.getElementById('resStok').style.color = 'var(--red)';
//       } else if (totalStok <= 5) {
//         stokBadge.textContent = 'STOK MENIPIS';
//         stokBadge.className = 'badge';
//         stokBadge.style.background = '#fef08a';
//         stokBadge.style.color = '#854d0e';
//         document.getElementById('resStok').style.color = '#eab308';
//       } else {
//         stokBadge.textContent = 'TERSEDIA';
//         stokBadge.className = 'badge badge-green';
//         document.getElementById('resStok').style.color = 'var(--text)';
//       }

//       // Render daftar lokasi rak di hasil scan
//       const lokasiContainer = document.getElementById('resLokasiContainer');
//       if (lokasiProduk.length === 0) {
//         lokasiContainer.innerHTML = `<div style="padding:16px 24px;color:var(--text3);font-size:13px;text-align:center;">Belum ada data penempatan rak</div>`;
//       } else {
//         lokasiContainer.innerHTML = `
//           <table style="width:100%;border-collapse:collapse;font-size:12px;">
//             <thead style="background:#f8fafc">
//               <tr>
//                 <th style="padding:8px 24px;text-align:left;color:var(--text3);font-weight:600">Rak</th>
//                 <th style="padding:8px;text-align:left;color:var(--text3);font-weight:600">Lantai</th>
//                 <th style="padding:8px;text-align:left;color:var(--text3);font-weight:600">Baris</th>
//                 <th style="padding:8px 24px;text-align:right;color:var(--text3);font-weight:600">Jml</th>
//               </tr>
//             </thead>
//             <tbody>
//               ${lokasiProduk.map((l, i) => `
//                 <tr style="border-top:1px solid var(--border); ${i % 2 !== 0 ? 'background:#f8fafc' : ''}">
//                   <td style="padding:8px 24px;font-weight:600;color:var(--accent)">R${l.rak}</td>
//                   <td style="padding:8px">L${l.lantai}</td>
//                   <td style="padding:8px">B${l.baris}</td>
//                   <td style="padding:8px 24px;text-align:right;font-family:var(--font-mono);font-weight:700">${l.jumlah}</td>
//                 </tr>
//               `).join('')}
//             </tbody>
//           </table>
//         `;
//       }

//       // Atur Form Transaksi berdasarkan Tipe
//       document.getElementById('txJumlah').value = 1;
//       document.getElementById('txCatatan').value = '';
      
//       const btnTx = document.getElementById('btnTransaksi');
//       const lokasiMasukSec = document.getElementById('lokasiMasukSection');
//       const sudahAdaSec = document.getElementById('sudahAdaSection');
//       const formTxSec = document.getElementById('formTransaksiSection');
      
//       formTxSec.style.display = 'block';

//       if (currentTipeTransaksi === 'MASUK') {
//         btnTx.className = 'btn btn-success';
//         btnTx.innerHTML = '📥 Catat Barang Masuk';
//         lokasiMasukSec.style.display = 'block';
//         sudahAdaSec.style.display = 'none';
        
//         // Auto-fill lokasi jika sebelumnya sudah pernah ditempatkan
//         if (lokasiProduk.length > 0) {
//           document.getElementById('txRak').value = lokasiProduk[0].rak || '';
//           document.getElementById('txLantai').value = lokasiProduk[0].lantai || '';
//           document.getElementById('txBaris').value = lokasiProduk[0].baris || '';
//         } else {
//           document.getElementById('txRak').value = p.rak || '';
//           document.getElementById('txLantai').value = p.lantai || '';
//           document.getElementById('txBaris').value = p.baris || '';
//         }

//       } else if (currentTipeTransaksi === 'KELUAR') {
//         btnTx.className = 'btn btn-danger';
//         btnTx.innerHTML = '📤 Catat Barang Keluar';
//         lokasiMasukSec.style.display = 'none';
//         sudahAdaSec.style.display = 'none';

//       } else if (currentTipeTransaksi === 'TAMBAH') {
//         // Jika sedang di mode Tambah Data tapi barangnya ternyata sudah ada
//         sudahAdaSec.style.display = 'block';
//         btnTx.className = 'btn btn-primary';
//         btnTx.innerHTML = '➕ Tambah Stok / Lokasi Baru';
//         lokasiMasukSec.style.display = 'block';
        
//         // Reset lokasi agar user harus memilih tempat baru
//         document.getElementById('txRak').value = '';
//         document.getElementById('txLantai').value = '';
//         document.getElementById('txBaris').value = '';
//       }

//       // [PERBAIKAN] SCROLL OTOMATIS KE PANEL HASIL
//       setTimeout(() => {
//         document.querySelector('.result-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
//       }, 100);

//     } else {
//       // 2. BARCODE TIDAK DITEMUKAN (PRODUK BARU)
//       currentScanResult = null;
//       document.getElementById('resultEmpty').style.display = 'none';
//       document.getElementById('resultFound').classList.remove('show');
//       document.getElementById('resultNotFound').style.display = 'block';
//       document.getElementById('notFoundBarcode').textContent = barcode;
//       document.getElementById('quickAddBarcode').value = barcode;

//       // Bersihkan form tambah cepat
//       document.getElementById('quickAddNama').value = '';
//       document.getElementById('quickAddKategori').value = '';
//       document.getElementById('quickAddSatuan').value = 'pcs';

//       // [PERBAIKAN] SCROLL OTOMATIS KE PANEL NOT FOUND
//       setTimeout(() => {
//         document.getElementById('resultNotFound').scrollIntoView({ behavior: 'smooth', block: 'start' });
//       }, 100);
//     }
//   }).catch(err => {
//     hideLoading();
//     showToast('Terjadi kesalahan koneksi', 'error');
//     console.error(err);
//   });
// }

// =============================================
// PROSES PENCARIAN BARCODE (DARI SCAN / MANUAL)
// =============================================
function processBarcode(barcode) {
  if (!barcode) return;
  barcode = String(barcode).trim();
  if (barcode === '') { showToast('Barcode tidak boleh kosong', 'error'); return; }

  showLoading();
  
  Promise.all([
    callAPI('getProdukByBarcode', barcode),
    callAPI('getSemuaLokasi')
  ]).then(([produkResult, lokasiResult]) => {
    hideLoading();
    const semuaLokasi = lokasiResult.data || [];

    if (produkResult.success) {
      const p = produkResult.data;
      currentScanResult = p;
      
      const lokasiProduk = semuaLokasi.filter(l => String(l.barcode) === String(barcode));
      // SIMPAN DATA LOKASI KE MEMORI UNTUK OPNAME
      window.currentLokasiProduk = lokasiProduk; 
      
      document.getElementById('resultEmpty').style.display = 'none';
      document.getElementById('resultNotFound').style.display = 'none';
      document.getElementById('resultFound').classList.add('show');

      document.getElementById('resNama').textContent = p.nama;
      document.getElementById('resBarcode').textContent = p.barcode;
      document.getElementById('resKategori').textContent = p.kategori || 'Umum';
      document.getElementById('resDeskripsi').textContent = p.deskripsi || '';
      document.getElementById('resSatuan').textContent = p.satuan || 'pcs';

      const totalStok = lokasiProduk.length > 0 
        ? lokasiProduk.reduce((sum, l) => sum + (parseInt(l.jumlah) || 0), 0) : p.stok;
      
      document.getElementById('resStok').textContent = totalStok;

      const stokBadge = document.getElementById('resStokBadge');
      if (totalStok <= 0) {
        stokBadge.textContent = 'STOK HABIS';
        stokBadge.className = 'badge badge-red';
        document.getElementById('resStok').style.color = 'var(--red)';
      } else if (totalStok <= 5) {
        stokBadge.textContent = 'STOK MENIPIS';
        stokBadge.className = 'badge';
        stokBadge.style.background = '#fef08a';
        stokBadge.style.color = '#854d0e';
        document.getElementById('resStok').style.color = '#eab308';
      } else {
        stokBadge.textContent = 'TERSEDIA';
        stokBadge.className = 'badge badge-green';
        document.getElementById('resStok').style.color = 'var(--text)';
      }

      const lokasiContainer = document.getElementById('resLokasiContainer');
      if (lokasiProduk.length === 0) {
        lokasiContainer.innerHTML = `<div style="padding:16px 24px;color:var(--text3);font-size:13px;text-align:center;">Belum ada data penempatan rak</div>`;
      } else {
        lokasiContainer.innerHTML = `
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead style="background:#f8fafc">
              <tr>
                <th style="padding:8px 24px;text-align:left;color:var(--text3);font-weight:600">Rak</th>
                <th style="padding:8px;text-align:left;color:var(--text3);font-weight:600">Lantai</th>
                <th style="padding:8px;text-align:left;color:var(--text3);font-weight:600">Baris</th>
                <th style="padding:8px 24px;text-align:right;color:var(--text3);font-weight:600">Jml</th>
              </tr>
            </thead>
            <tbody>
              ${lokasiProduk.map((l, i) => `
                <tr style="border-top:1px solid var(--border); ${i % 2 !== 0 ? 'background:#f8fafc' : ''}">
                  <td style="padding:8px 24px;font-weight:600;color:var(--accent)">R${l.rak}</td>
                  <td style="padding:8px">L${l.lantai}</td>
                  <td style="padding:8px">B${l.baris}</td>
                  <td style="padding:8px 24px;text-align:right;font-family:var(--font-mono);font-weight:700">${l.jumlah}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }

      // Atur form berdasarkan tipe transaksi saat ini
      document.getElementById('txJumlah').value = (currentTipeTransaksi === 'OPNAME') ? totalStok : '';
      document.getElementById('txCatatan').value = (currentTipeTransaksi === 'OPNAME') ? 'Koreksi Opname' : '';
      
      if (lokasiProduk.length > 0) {
        document.getElementById('txRak').value = lokasiProduk[0].rak || '';
        document.getElementById('txLantai').value = lokasiProduk[0].lantai || '';
        document.getElementById('txBaris').value = lokasiProduk[0].baris || '';
      }
      
      // Panggil setTipeTransaksi untuk merapikan UI tombol dan teks
      setTipeTransaksi(currentTipeTransaksi);

      setTimeout(() => {
        document.querySelector('.result-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);

    } else {
      currentScanResult = null;
      document.getElementById('resultEmpty').style.display = 'none';
      document.getElementById('resultFound').classList.remove('show');
      document.getElementById('resultNotFound').style.display = 'block';
      document.getElementById('notFoundBarcode').textContent = barcode;
      document.getElementById('quickAddBarcode').value = barcode;

      if(document.getElementById('quickAddNama')) document.getElementById('quickAddNama').value = '';

      setTimeout(() => {
        document.getElementById('resultNotFound').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }).catch(err => {
    hideLoading(); showToast('Terjadi kesalahan koneksi', 'error');
  });
}

// function showResultFound(produk, lokasiProduk = []) {
//   currentScanResult = produk;

//   document.getElementById('resultEmpty').style.display = 'none';
//   document.getElementById('resultNotFound').style.display = 'none';
//   document.getElementById('resultFound').classList.add('show');

//   // Info dasar
//   document.getElementById('resNama').textContent = produk.nama;
//   document.getElementById('resBarcode').textContent = produk.barcode;
//   document.getElementById('resKategori').textContent = produk.kategori || 'Umum';
//   document.getElementById('resSatuan').textContent = produk.satuan || 'pcs';
//   document.getElementById('resDeskripsi').textContent = produk.deskripsi || '—';

//   // Stok dengan indikator warna — hitung dari total semua lokasi jika ada
//   const totalStok = lokasiProduk.length > 0
//     ? lokasiProduk.reduce((sum, l) => sum + (parseInt(l.jumlah) || 0), 0)
//     : produk.stok;

//   const stokEl = document.getElementById('resStok');
//   stokEl.textContent = totalStok;
//   stokEl.className = 'meta-value ' + (totalStok <= 0 ? 'stok-warning' : totalStok <= 5 ? 'stok-low' : 'stok-ok');

//   // Badge status stok
//   const stokBadgeEl = document.getElementById('resStokBadge');
//   if (totalStok <= 0) {
//     stokBadgeEl.textContent = 'HABIS';
//     stokBadgeEl.className = 'badge badge-red';
//   } else if (totalStok <= 5) {
//     stokBadgeEl.textContent = 'STOK RENDAH';
//     stokBadgeEl.className = 'badge badge-yellow';
//   } else {
//     stokBadgeEl.textContent = 'TERSEDIA';
//     stokBadgeEl.className = 'badge badge-green';
//   }

//   // Render tabel multi-lokasi
//   const lokasiContainer = document.getElementById('resLokasiContainer');
//   if (lokasiProduk.length === 0) {
//     lokasiContainer.innerHTML = `
//       <div style="text-align:center;padding:14px 0;color:var(--text3);font-size:13px">
//         <span style="font-size:28px;display:block;margin-bottom:6px;opacity:0.4">📍</span>
//         Belum ada data lokasi rak
//       </div>`;
//   } else {
//     lokasiContainer.innerHTML = `
//       <table style="width:100%;border-collapse:collapse;font-size:13px">
//         <thead>
//           <tr style="background:#eef0f6">
//             <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1.5px;color:var(--text2);font-family:var(--font-display);font-weight:700;text-transform:uppercase">Rak</th>
//             <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1.5px;color:var(--text2);font-family:var(--font-display);font-weight:700;text-transform:uppercase">Lantai</th>
//             <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1.5px;color:var(--text2);font-family:var(--font-display);font-weight:700;text-transform:uppercase">Baris</th>
//             <th style="padding:8px 10px;text-align:right;font-size:10px;letter-spacing:1.5px;color:var(--text2);font-family:var(--font-display);font-weight:700;text-transform:uppercase">Jumlah</th>
//             <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1.5px;color:var(--text2);font-family:var(--font-display);font-weight:700;text-transform:uppercase">Update</th>
//           </tr>
//         </thead>
//         <tbody>
//           ${lokasiProduk.map((l, i) => `
//             <tr style="border-top:1px solid var(--border);${i === 0 ? 'background:rgba(234,108,0,0.04)' : ''}">
//               <td style="padding:8px 10px"><span style="background:var(--accent);color:#fff;border-radius:5px;padding:2px 8px;font-family:var(--font-display);font-weight:700;font-size:13px">R${l.rak}</span></td>
//               <td style="padding:8px 10px;font-weight:600">Lantai ${l.lantai}</td>
//               <td style="padding:8px 10px;font-weight:600">Baris ${l.baris}</td>
//               <td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);font-weight:700;color:var(--accent)">${l.jumlah}</td>
//               <td style="padding:8px 10px;font-size:11px;color:var(--text3)">${l.lastUpdated || '—'}</td>
//             </tr>
//           `).join('')}
//         </tbody>
//         ${lokasiProduk.length > 1 ? `
//         <tfoot>
//           <tr style="border-top:2px solid var(--border);background:#f7f8fc">
//             <td colspan="3" style="padding:8px 10px;font-size:11px;color:var(--text3);font-family:var(--font-display);font-weight:700;letter-spacing:0.5px">${lokasiProduk.length} LOKASI TERDAFTAR</td>
//             <td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);font-weight:700">${lokasiProduk.reduce((sum, l) => sum + (parseInt(l.jumlah) || 0), 0)}</td>
//             <td></td>
//           </tr>
//         </tfoot>` : ''}
//       </table>`;
//   }

//   // Pre-fill lokasi dari data produk (lokasi utama)
//   if (produk.rak) {
//     document.getElementById('txRak').value = produk.rak;
//     document.getElementById('txLantai').value = produk.lantai;
//     document.getElementById('txBaris').value = produk.baris;
//   }

//   // Update button teks & warna
//   const btn = document.getElementById('btnTransaksi');
//   btn.textContent = currentTipeTransaksi === 'MASUK' ? '✓ Konfirmasi Masuk' : '✓ Konfirmasi Keluar';
//   btn.className = 'btn ' + (currentTipeTransaksi === 'MASUK' ? 'btn-success' : 'btn-danger');

//   // Show/hide lokasi section
//   document.getElementById('lokasiMasukSection').style.display = currentTipeTransaksi === 'MASUK' ? 'block' : 'none';
// }

function showResultFound(produk, lokasiProduk = []) {
  currentScanResult = produk;
  window.currentLokasiProduk = lokasiProduk; // <--- MENYIMPAN DATA LOKASI KE MEMORI

  document.getElementById('resultEmpty').style.display = 'none';
  document.getElementById('resultNotFound').style.display = 'none';
  document.getElementById('resultFound').classList.add('show');

  document.getElementById('resNama').textContent = produk.nama;
  document.getElementById('resBarcode').textContent = produk.barcode;
  document.getElementById('resKategori').textContent = produk.kategori || 'Umum';
  document.getElementById('resSatuan').textContent = produk.satuan || 'pcs';
  document.getElementById('resDeskripsi').textContent = produk.deskripsi || '—';

  const totalStok = lokasiProduk.length > 0
    ? lokasiProduk.reduce((sum, l) => sum + (parseInt(l.jumlah) || 0), 0)
    : produk.stok;

  const stokEl = document.getElementById('resStok');
  stokEl.textContent = totalStok;
  stokEl.className = 'meta-value ' + (totalStok <= 0 ? 'stok-warning' : totalStok <= 5 ? 'stok-low' : 'stok-ok');

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

  const btn = document.getElementById('btnTransaksi');
  if (btn) {
    if (currentTipeTransaksi === 'MASUK') { btn.textContent = '✓ Konfirmasi Masuk'; btn.className = 'btn btn-success'; }
    else if (currentTipeTransaksi === 'KELUAR') { btn.textContent = '✓ Konfirmasi Keluar'; btn.className = 'btn btn-danger'; }
    else if (currentTipeTransaksi === 'TAMBAH') { btn.textContent = '✓ Tambah Lokasi / Stok Baru'; btn.className = 'btn btn-primary'; }
  }

  const lokasiMasuk = document.getElementById('lokasiMasukSection');
  if (lokasiMasuk) {
    lokasiMasuk.style.display = 'block'; 
    
    const bannerLokasi = lokasiMasuk.querySelector('div:first-child');
    if (bannerLokasi) {
      if (currentTipeTransaksi === 'KELUAR') {
        bannerLokasi.style.background = 'var(--red-dim)';
        bannerLokasi.style.border = '1px solid rgba(220,38,38,0.2)';
        bannerLokasi.style.color = 'var(--red)';
        bannerLokasi.innerHTML = '📍 Tentukan dari rak mana barang DIAMBIL';
      } else {
        bannerLokasi.style.background = 'var(--green-dim)';
        bannerLokasi.style.border = '1px solid rgba(22,163,74,0.2)';
        bannerLokasi.style.color = 'var(--green)';
        bannerLokasi.innerHTML = '📍 Tentukan lokasi rak PENEMPATAN barang';
      }
    }
  }

  const formTx = document.getElementById('formTransaksiSection');
  const sudahAda = document.getElementById('sudahAdaSection');
  if (formTx && sudahAda) {
    formTx.style.display = 'block'; 
    sudahAda.style.display = currentTipeTransaksi === 'TAMBAH' ? 'block' : 'none';
  }
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

// function quickAddProduk() {
//   const nama = document.getElementById('quickAddNama').value.trim();
//   const barcode = document.getElementById('quickAddBarcode').value.trim();
//   const kategori = document.getElementById('quickAddKategori').value.trim();
//   const satuan = document.getElementById('quickAddSatuan').value;
//   if (!nama) { showToast('Nama produk wajib diisi!', 'error'); return; }
//   // Isi modal produk lalu buka
//   document.getElementById('modalProdukTitle').textContent = 'TAMBAH PRODUK';
//   document.getElementById('editProdukId').value = '';
//   document.getElementById('produkBarcode').value = barcode;
//   document.getElementById('produkNama').value = nama;
//   document.getElementById('produkKategori').value = kategori;
//   document.getElementById('produkSatuan').value = satuan;
//   document.getElementById('produkStok').value = '0';
//   document.getElementById('produkDeskripsi').value = '';
//   document.getElementById('produkRak').value = '';
//   document.getElementById('produkLantai').value = '';
//   document.getElementById('produkBaris').value = '';
//   openModal('modalProduk');
// }

// function quickAddProduk() {
//   const operator = document.getElementById('quickAddOperator').value.trim(); // Ambil Operator
//   const nama = document.getElementById('quickAddNama').value.trim();
//   const barcode = document.getElementById('quickAddBarcode').value.trim();
//   const kategori = document.getElementById('quickAddKategori').value.trim();
//   const satuan = document.getElementById('quickAddSatuan').value;
  
//   if (!operator) { showToast('Nama Operator wajib diisi!', 'error'); return; }
//   if (!nama) { showToast('Nama produk wajib diisi!', 'error'); return; }
  
//   document.getElementById('modalProdukTitle').textContent = 'TAMBAH PRODUK';
//   document.getElementById('editProdukId').value = '';
  
//   // Set nilai ke dalam modal
//   if(document.getElementById('produkOperator')) document.getElementById('produkOperator').value = operator;
  
//   document.getElementById('produkBarcode').value = barcode;
//   document.getElementById('produkNama').value = nama;
//   document.getElementById('produkKategori').value = kategori;
//   document.getElementById('produkSatuan').value = satuan;
//   document.getElementById('produkStok').value = '0';
//   document.getElementById('produkDeskripsi').value = '';
//   document.getElementById('produkRak').value = '';
//   document.getElementById('produkLantai').value = '';
//   document.getElementById('produkBaris').value = '';
  
//   openModal('modalProduk');
// }

// =============================================
// TAMBAH PRODUK CEPAT DARI HASIL SCAN (NOT FOUND)
// =============================================
function quickAddProduk() {
  const operator = document.getElementById('quickAddOperator').value.trim();
  const nama = document.getElementById('quickAddNama').value.trim();
  const barcode = document.getElementById('quickAddBarcode').value.trim();
  const kategori = document.getElementById('quickAddKategori').value.trim();
  const satuan = document.getElementById('quickAddSatuan').value;
  
  if (!operator) { showToast('Nama Operator wajib diisi!', 'error'); return; }
  if (!nama) { showToast('Nama produk wajib diisi!', 'error'); return; }
  
  // Siapkan modal utama
  document.getElementById('modalProdukTitle').textContent = 'TAMBAH PRODUK';
  document.getElementById('editProdukId').value = '';
  
  // Set nilai dari input Quick Add ke dalam modal utama
  if (document.getElementById('produkOperator')) {
    document.getElementById('produkOperator').value = operator;
  }
  document.getElementById('produkBarcode').value = barcode;
  document.getElementById('produkNama').value = nama;
  document.getElementById('produkKategori').value = kategori;
  document.getElementById('produkSatuan').value = satuan;
  
  // Reset kolom pelengkap agar kosong/default
  document.getElementById('produkStok').value = '0';
  document.getElementById('produkDeskripsi').value = '';
  document.getElementById('produkRak').value = '';
  document.getElementById('produkLantai').value = '';
  document.getElementById('produkBaris').value = '';
  
  // Buka Modal Tambah Produk yang lengkap
  openModal('modalProduk');
}

function saveProduk() {
  const barcode = document.getElementById('produkBarcode').value.trim();
  const nama = document.getElementById('produkNama').value.trim();
  const operator = document.getElementById('produkOperator') ? document.getElementById('produkOperator').value.trim() : 'Admin';
  
  if (!barcode || !nama) { showToast('Barcode dan nama produk wajib diisi!', 'error'); return; }
  if (!operator) { showToast('Nama Operator wajib diisi!', 'error'); return; }

  const id = document.getElementById('editProdukId').value;
  const data = {
    id, barcode, nama,
    kategori: document.getElementById('produkKategori').value,
    satuan: document.getElementById('produkSatuan').value,
    stok: parseInt(document.getElementById('produkStok').value) || 0,
    deskripsi: document.getElementById('produkDeskripsi').value,
    rak: document.getElementById('produkRak').value,
    lantai: document.getElementById('produkLantai').value,
    baris: document.getElementById('produkBaris').value,
    operator: operator // <--- Kirim operator ke backend
  };

  showLoading();
  const fn = id ? 'editProduk' : 'tambahProduk'; 
  
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

// =============================================
// TIPE TRANSAKSI
// =============================================
// function setTipeTransaksi(tipe) {
//   currentTipeTransaksi = tipe;
//   document.getElementById('tab-masuk').classList.toggle('active', tipe === 'MASUK');
//   document.getElementById('tab-keluar').classList.toggle('active', tipe === 'KELUAR');
  
//   const badge = document.getElementById('scan-tipe-badge');
//   badge.textContent = tipe;
//   badge.className = 'badge ' + (tipe === 'MASUK' ? 'badge-green' : 'badge-red');

//   document.getElementById('lokasiMasukSection').style.display = tipe === 'MASUK' ? 'block' : 'none';

//   if (currentScanResult) {
//     const btn = document.getElementById('btnTransaksi');
//     btn.textContent = tipe === 'MASUK' ? '✓ Konfirmasi Masuk' : '✓ Konfirmasi Keluar';
//     btn.className = 'btn ' + (tipe === 'MASUK' ? 'btn-success' : 'btn-danger');
//   }
// }
// =============================================
// TIPE TRANSAKSI
// =============================================
// function setTipeTransaksi(tipe) {
//   currentTipeTransaksi = tipe;
  
//   // Update class active pada tab
//   document.getElementById('tab-masuk').classList.toggle('active', tipe === 'MASUK');
//   document.getElementById('tab-keluar').classList.toggle('active', tipe === 'KELUAR');
//   const tabTambah = document.getElementById('tab-tambah');
//   if (tabTambah) {
//     tabTambah.style.backgroundColor = tipe === 'TAMBAH' ? 'var(--blue)' : 'var(--bg3)';
//     tabTambah.style.color = tipe === 'TAMBAH' ? '#fff' : 'var(--text2)';
//   }

//   // Update Badge
//   const badge = document.getElementById('scan-tipe-badge');
//   badge.textContent = tipe === 'TAMBAH' ? 'TAMBAH DATA' : tipe;
  
//   if (tipe === 'MASUK') badge.className = 'badge badge-green';
//   else if (tipe === 'KELUAR') badge.className = 'badge badge-red';
//   else badge.className = 'badge badge-blue';

//   // [PERBAIKAN] Tampilkan form lokasi untuk SEMUA tipe transaksi (Masuk, Keluar, Tambah)
//   const lokasiMasuk = document.getElementById('lokasiMasukSection');
//   if (lokasiMasuk) {
//     lokasiMasuk.style.display = 'block'; 
    
//     // Ubah teks dan warna banner info lokasi sesuai transaksi
//     const bannerLokasi = lokasiMasuk.querySelector('div:first-child');
//     if (bannerLokasi) {
//       if (tipe === 'KELUAR') {
//         bannerLokasi.style.background = 'var(--red-dim)';
//         bannerLokasi.style.border = '1px solid rgba(220,38,38,0.2)';
//         bannerLokasi.style.color = 'var(--red)';
//         bannerLokasi.innerHTML = '📍 Tentukan dari rak mana barang DIAMBIL';
//       } else {
//         bannerLokasi.style.background = 'var(--green-dim)';
//         bannerLokasi.style.border = '1px solid rgba(22,163,74,0.2)';
//         bannerLokasi.style.color = 'var(--green)';
//         bannerLokasi.innerHTML = '📍 Tentukan lokasi rak PENEMPATAN barang';
//       }
//     }
//   }

//   // Form Transaksi selalu tampil, Banner Info hanya tampil di mode TAMBAH
//   const formTx = document.getElementById('formTransaksiSection');
//   const sudahAda = document.getElementById('sudahAdaSection');
//   if (formTx && sudahAda) {
//     formTx.style.display = 'block';
//     sudahAda.style.display = tipe === 'TAMBAH' ? 'block' : 'none';
//   }

//   // Update tombol transaksi jika produk sedang terpilih
//   if (currentScanResult) {
//     const btn = document.getElementById('btnTransaksi');
//     if (btn) {
//       if (tipe === 'MASUK') { btn.textContent = '✓ Konfirmasi Masuk'; btn.className = 'btn btn-success'; }
//       else if (tipe === 'KELUAR') { btn.textContent = '✓ Konfirmasi Keluar'; btn.className = 'btn btn-danger'; }
//       else if (tipe === 'TAMBAH') { btn.textContent = '✓ Tambah Lokasi / Stok Baru'; btn.className = 'btn btn-primary'; }
//     }
//   }
// }

// =============================================
// TIPE TRANSAKSI
// =============================================
function setTipeTransaksi(tipe) {
  currentTipeTransaksi = tipe;
  
  // Update class active pada tab utama
  document.getElementById('tab-masuk').classList.toggle('active', tipe === 'MASUK');
  document.getElementById('tab-keluar').classList.toggle('active', tipe === 'KELUAR');
  
  // Update Tab Tambah Data
  const tabTambah = document.getElementById('tab-tambah');
  if (tabTambah) {
    tabTambah.style.backgroundColor = tipe === 'TAMBAH' ? 'var(--blue)' : 'var(--bg3)';
    tabTambah.style.color = tipe === 'TAMBAH' ? '#fff' : 'var(--text2)';
  }
  
  // Update Tab Opname
  const tabOpname = document.getElementById('tab-opname');
  if (tabOpname) {
    tabOpname.style.backgroundColor = tipe === 'OPNAME' ? '#f59e0b' : '#fef3c7';
    tabOpname.style.color = tipe === 'OPNAME' ? '#fff' : '#d97706';
  }

  // Update Badge Hasil
  const badge = document.getElementById('scan-tipe-badge');
  badge.textContent = tipe === 'TAMBAH' ? 'TAMBAH DATA' : (tipe === 'OPNAME' ? 'OPNAME FISIK' : tipe);
  
  if (tipe === 'MASUK') badge.className = 'badge badge-green';
  else if (tipe === 'KELUAR') badge.className = 'badge badge-red';
  else if (tipe === 'OPNAME') badge.className = 'badge badge-yellow';
  else badge.className = 'badge badge-blue';

  // Tampilkan form lokasi untuk SEMUA tipe transaksi
  const lokasiMasuk = document.getElementById('lokasiMasukSection');
  if (lokasiMasuk) {
    lokasiMasuk.style.display = 'block'; 
    
    // Ubah teks dan warna banner info lokasi sesuai transaksi
    const bannerLokasi = lokasiMasuk.querySelector('div:first-child');
    if (bannerLokasi) {
      if (tipe === 'KELUAR') {
        bannerLokasi.style.background = 'var(--red-dim)';
        bannerLokasi.style.border = '1px solid rgba(220,38,38,0.2)';
        bannerLokasi.style.color = 'var(--red)';
        bannerLokasi.innerHTML = '📍 Tentukan dari rak mana barang DIAMBIL';
      } else if (tipe === 'OPNAME') {
        bannerLokasi.style.background = '#fef3c7';
        bannerLokasi.style.border = '1px solid #fde68a';
        bannerLokasi.style.color = '#d97706';
        bannerLokasi.innerHTML = '📍 Tentukan rak mana yang sedang di-OPNAME';
      } else {
        bannerLokasi.style.background = 'var(--green-dim)';
        bannerLokasi.style.border = '1px solid rgba(22,163,74,0.2)';
        bannerLokasi.style.color = 'var(--green)';
        bannerLokasi.innerHTML = '📍 Tentukan lokasi rak PENEMPATAN barang';
      }
    }
  }

  // Update Label Jumlah
  const labelJumlah = document.querySelector('label[for="txJumlah"]');
  if (labelJumlah) {
    labelJumlah.innerHTML = tipe === 'OPNAME' ? 'Jumlah Fisik Aktual <span style="color:var(--red)">*</span>' : 'Jumlah';
  }

  // Form Transaksi
  const formTx = document.getElementById('formTransaksiSection');
  const sudahAda = document.getElementById('sudahAdaSection');
  if (formTx && sudahAda) {
    formTx.style.display = 'block';
    sudahAda.style.display = tipe === 'TAMBAH' ? 'block' : 'none';
  }

  // Update tombol transaksi jika produk sedang terpilih
  if (currentScanResult) {
    const btn = document.getElementById('btnTransaksi');
    if (btn) {
      // Reset style bawaan dulu
      btn.style.background = ''; btn.style.color = '';
      
      if (tipe === 'MASUK') { btn.textContent = '✓ Konfirmasi Masuk'; btn.className = 'btn btn-success'; }
      else if (tipe === 'KELUAR') { btn.textContent = '✓ Konfirmasi Keluar'; btn.className = 'btn btn-danger'; }
      else if (tipe === 'TAMBAH') { btn.textContent = '✓ Tambah Lokasi / Stok Baru'; btn.className = 'btn btn-primary'; }
      else if (tipe === 'OPNAME') { btn.textContent = '⚖️ Sesuaikan Stok Fisik'; btn.className = 'btn'; btn.style.background = '#f59e0b'; btn.style.color = '#fff'; }
    }
  }
}

// =============================================
// TRANSAKSI
// =============================================
// function submitTransaksi() {
//   if (!currentScanResult) { showToast('Scan atau cari produk terlebih dahulu', 'error'); return; }
  
//   // Validasi Nama Operator
//   const operator = document.getElementById('txOperator').value.trim();
//   if (!operator) { showToast('Nama Operator wajib diisi!', 'error'); return; }

//   const jumlah = parseInt(document.getElementById('txJumlah').value);
//   if (!jumlah || jumlah <= 0) { showToast('Masukkan jumlah yang valid', 'error'); return; }

//   const rak = document.getElementById('txRak').value;
//   const lantai = document.getElementById('txLantai').value;
//   const baris = document.getElementById('txBaris').value;

//   if (!rak || !lantai || !baris) {
//     showToast('Pilih lokasi rak, lantai, dan baris', 'error');
//     return;
//   }

//   // === PERBAIKAN: VALIDASI LOKASI UNTUK BARANG KELUAR ===
//   if (currentTipeTransaksi === 'KELUAR') {
//     // Cari apakah lokasi yang dipilih user BENAR-BENAR menyimpan barang ini
//     const lokasiTujuan = (window.currentLokasiProduk || []).find(
//       l => l.rak == rak && l.lantai == lantai && l.baris == baris
//     );

//     if (!lokasiTujuan) {
//       // Tolak transaksi jika barang tidak ada di rak tersebut
//       showToast(`❌ Barang tidak ditemukan di Rak ${rak} L${lantai} B${baris}!`, 'error');
//       return;
//     }

//     // Cek apakah stok di rak tersebut cukup
//     const stokDiLokasi = parseInt(lokasiTujuan.jumlah) || 0;
//     if (jumlah > stokDiLokasi) {
//       // Tolak transaksi jika jumlah keluar > sisa stok di rak tersebut
//       showToast(`❌ Stok tidak cukup! Hanya tersisa ${stokDiLokasi} di lokasi ini.`, 'error');
//       return;
//     }
//   }
//   // =======================================================

//   showLoading();
//   const data = {
//     barcode: currentScanResult.barcode,
//     namaProduk: currentScanResult.nama,
//     tipe: currentTipeTransaksi,
//     jumlah: jumlah,
//     rak: rak, lantai: lantai, baris: baris,
//     catatan: document.getElementById('txCatatan').value,
//     operator: operator 
//   };

//   callAPI('catatTransaksi', data)
//     .then(result => {
//       hideLoading();
//       if (result.success) {
//         showToast('Transaksi berhasil dicatat!', 'success');
//         playBeep();
        
//         document.getElementById('txJumlah').value = 1;
//         document.getElementById('txCatatan').value = '';
//         document.getElementById('txRak').value = '';
//         document.getElementById('txLantai').value = '';
//         document.getElementById('txBaris').value = '';
        
//         document.getElementById('resultFound').classList.remove('show');
//         document.getElementById('resultEmpty').style.display = 'block';
//         document.getElementById('manualBarcode').value = '';
//         currentScanResult = null;
//         window.currentLokasiProduk = []; // Reset memori lokasi
//         loadDashboard();
//       } else { showToast('Gagal: ' + result.message, 'error'); }
//     })
//     .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
// }


// =============================================
// TRANSAKSI
// =============================================
function submitTransaksi() {
  if (!currentScanResult) { showToast('Scan atau cari produk terlebih dahulu', 'error'); return; }
  
  const operator = document.getElementById('txOperator').value.trim();
  if (!operator) { showToast('Nama Operator wajib diisi!', 'error'); return; }

  let jumlah = parseInt(document.getElementById('txJumlah').value);
  if (isNaN(jumlah) || (currentTipeTransaksi !== 'OPNAME' && jumlah <= 0) || (currentTipeTransaksi === 'OPNAME' && jumlah < 0)) { 
    showToast('Masukkan jumlah yang valid', 'error'); return; 
  }

  const rak = document.getElementById('txRak').value;
  const lantai = document.getElementById('txLantai').value;
  const baris = document.getElementById('txBaris').value;

  if (!rak || !lantai || !baris) {
    showToast('Pilih lokasi rak, lantai, dan baris', 'error'); return;
  }

  let finalTipe = currentTipeTransaksi;
  let finalJumlah = jumlah;
  let finalCatatan = document.getElementById('txCatatan').value;

  // Cari data lokasi di memori
  const lokasiTujuan = (window.currentLokasiProduk || []).find(
    l => l.rak == rak && l.lantai == lantai && l.baris == baris
  );
  const stokDiLokasi = lokasiTujuan ? (parseInt(lokasiTujuan.jumlah) || 0) : 0;

  // VALIDASI KELUAR
  if (currentTipeTransaksi === 'KELUAR') {
    if (!lokasiTujuan) {
      showToast(`❌ Barang tidak ditemukan di Rak ${rak} L${lantai} B${baris}!`, 'error'); return;
    }
    if (jumlah > stokDiLokasi) {
      showToast(`❌ Stok tidak cukup! Hanya tersisa ${stokDiLokasi} di lokasi ini.`, 'error'); return;
    }
  }

  // LOGIKA CERDAS OPNAME
  if (currentTipeTransaksi === 'OPNAME') {
    let selisih = jumlah - stokDiLokasi;

    if (selisih === 0) {
      showToast(`✅ Stok fisik di Rak ${rak} sesuai dengan sistem (${stokDiLokasi} pcs). Tidak ada koreksi.`, 'info');
      return; 
    }

    if (selisih > 0) {
      finalTipe = 'MASUK';
      finalJumlah = selisih; 
      finalCatatan = 'Koreksi Opname (Kelebihan Fisik) | ' + finalCatatan;
    } else {
      finalTipe = 'KELUAR';
      finalJumlah = Math.abs(selisih); 
      finalCatatan = 'Koreksi Opname (Barang Hilang) | ' + finalCatatan;
    }
  }

  showLoading();
  const data = {
    barcode: currentScanResult.barcode,
    namaProduk: currentScanResult.nama,
    tipe: finalTipe, // Bisa berubah otomatis jadi MASUK/KELUAR jika Opname
    jumlah: finalJumlah,
    rak: rak, lantai: lantai, baris: baris,
    catatan: finalCatatan,
    operator: operator 
  };

  callAPI('catatTransaksi', data)
    .then(result => {
      hideLoading();
      if (result.success) {
        showToast('Transaksi berhasil dicatat!', 'success');
        if (typeof playBeep === 'function') playBeep();
        
        document.getElementById('txJumlah').value = 1;
        document.getElementById('txCatatan').value = '';
        document.getElementById('txRak').value = '';
        document.getElementById('txLantai').value = '';
        document.getElementById('txBaris').value = '';
        
        // === MODE BERUNTUN (RAPID SCAN) ===
        if (window._isRapidScanMode) {
          const tipeLanjutan = currentTipeTransaksi;
          document.getElementById('resultFound').classList.remove('show');
          document.getElementById('resultEmpty').style.display = 'block';
          currentScanResult = null;
          window.currentLokasiProduk = [];
          
          showToast('Memulai scan berikutnya...', 'info');
          setTimeout(() => {
            startQuickScan(tipeLanjutan);
          }, 500);

        } else {
          document.getElementById('resultFound').classList.remove('show');
          document.getElementById('resultEmpty').style.display = 'block';
          document.getElementById('manualBarcode').value = '';
          currentScanResult = null;
          window.currentLokasiProduk = []; 
          if(typeof loadDashboard === 'function') loadDashboard();
        }

      } else { showToast('Gagal: ' + result.message, 'error'); }
    })
    .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
}

// =============================================
// PRODUK CRUD
// =============================================
// function loadProduk() {
//   showLoading();
//   // Mengambil data produk dan data lokasi secara bersamaan agar cepat
//   Promise.all([
//     callAPI('getAllProduk'),
//     callAPI('getSemuaLokasi')
//   ])
//   .then(([produkResult, lokasiResult]) => {
//     hideLoading();
//     if (!produkResult.success) { showToast('Gagal memuat produk', 'error'); return; }

//     const semuaLokasi = lokasiResult.success ? lokasiResult.data : [];

//     // Gabungkan riwayat multi-lokasi ke dalam setiap baris produk
//     allProdukData = produkResult.data.map(p => {
//       // Filter lokasi khusus untuk barcode produk ini
//       p.listLokasi = semuaLokasi.filter(l => String(l.barcode) === String(p.barcode));
//       return p;
//     });

//     renderProdukTable(allProdukData);
//     buildKategoriFilter(allProdukData);
//   })
//   .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
// }

function loadProduk() {
  const CACHE_KEY = 'wms_cache_produk_lokasi';

  // ========================================================
  // 1. FASE "SAT SET": TAMPILKAN DATA DARI MEMORI HP JIKA ADA
  // ========================================================
  const cachedData = localStorage.getItem(CACHE_KEY);
  if (cachedData) {
    try {
      // Ambil data dari memori dan langsung cetak ke layar dalam 0.1 detik!
      allProdukData = JSON.parse(cachedData);
      renderProdukTable(allProdukData);
      buildKategoriFilter(allProdukData);
      console.log("⚡ Data Produk dimuat instan dari cache HP!");
    } catch (e) {
      console.error("Gagal membaca cache, memuat ulang dari server...");
    }
  } else {
    // Jika aplikasi baru pertama kali diinstal (belum ada cache), tampilkan loading
    showLoading();
  }

  // ========================================================
  // 2. FASE "SINKRONISASI": AMBIL DATA TERBARU SECARA DIAM-DIAM
  // ========================================================
  Promise.all([
    callAPI('getAllProduk'),
    callAPI('getSemuaLokasi')
  ])
  .then(([produkResult, lokasiResult]) => {
    // Jika sebelumnya menampilkan loading (karena tidak ada cache), sekarang matikan
    if (!cachedData) hideLoading(); 

    if (!produkResult.success) { 
      // Hanya tampilkan error jika layar benar-benar kosong (tidak ada cache)
      if (!cachedData) showToast('Gagal memuat produk dari server', 'error'); 
      return; 
    }

    const semuaLokasi = lokasiResult.success ? lokasiResult.data : [];

    // Gabungkan riwayat multi-lokasi ke dalam setiap baris produk
    const newData = produkResult.data.map(p => {
      p.listLokasi = semuaLokasi.filter(l => String(l.barcode) === String(p.barcode));
      return p;
    });

    // Update variabel global dengan data terbaru dari server
    allProdukData = newData;

    // ========================================================
    // 3. FASE "UPDATE": SIMPAN CACHE BARU & REFRESH TAMPILAN
    // ========================================================
    localStorage.setItem(CACHE_KEY, JSON.stringify(allProdukData)); // Simpan ke HP
    
    // Perbarui tabel secara halus (tanpa layar loading)
    renderProdukTable(allProdukData);
    buildKategoriFilter(allProdukData);
    
  })
  .catch(err => { 
    if (!cachedData) {
      hideLoading(); 
      showToast('Error koneksi: ' + err, 'error'); 
    } else {
      // Jika error karena sinyal jelek di gudang, diamkan saja. 
      // User tetap bisa melihat data dari Cache HP secara Offline!
      console.warn("Sedang offline. Menggunakan data cache produk.");
    }
  });
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
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📦</div><p>Belum ada produk. Tambahkan produk pertama!</p></div></td></tr>';
    return;
  }
  
  tbody.innerHTML = data.map(p => {
    const stokClass = p.stok <= 0 ? 'stok-warning' : p.stok <= 5 ? 'stok-low' : 'stok-ok';
    
    // [PERBAIKAN] Menampilkan Multi-Lokasi
    let lokasiHtml = '';
    if (p.listLokasi && p.listLokasi.length > 0) {
      // Jika terdaftar di banyak rak
      lokasiHtml = p.listLokasi.map(l => 
        `<div style="margin-bottom:4px; font-size:11px; background:var(--bg3); padding:3px 6px; border-radius:4px; display:inline-block; border:1px solid var(--border); white-space:nowrap;">
          <strong>R${l.rak} L${l.lantai} B${l.baris}</strong> 
          <span style="color:var(--accent); font-weight:700; margin-left:4px;">(${l.jumlah})</span>
         </div>`
      ).join('<br>');
    } else if (p.rak) {
      // Jika data lama hanya punya lokasi utama
      lokasiHtml = `<div style="font-size:11px; background:var(--bg3); padding:3px 6px; border-radius:4px; display:inline-block; border:1px solid var(--border);">
          <strong>R${p.rak} L${p.lantai} B${p.baris}</strong>
         </div>`;
    } else {
      lokasiHtml = '<span style="color:var(--text3)">—</span>';
    }

    return `
      <tr>
        <td class="barcode-cell">${p.barcode}</td>
        <td><strong>${p.nama}</strong><div style="font-size:11px;color:var(--text3)">${p.deskripsi||''}</div></td>
        <td><span class="badge badge-blue">${p.kategori||'—'}</span></td>
        <td><span class="stok-badge ${stokClass}">${p.stok}</span></td>
        <td style="color:var(--text3)">${p.satuan}</td>
        
        <td style="font-family:var(--font-mono); line-height:1.2;">${lokasiHtml}</td>
        
        <td style="font-size:13px; color:var(--text3); font-weight:600;">${p.operator || '—'}</td>
        
        <td>
          <div class="td-actions">
            <button class="btn btn-outline btn-sm btn-icon" onclick="editProdukById('${p.id}')" title="Edit">✏️</button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="hapusProdukModal('${p.id}','${p.nama.replace(/'/g,'\\\'')}')" title="Hapus">🗑️</button>
            <button class="btn btn-outline btn-sm btn-icon" onclick="cetakBarcode('${p.barcode}', '${p.nama}')" title="Cetak Label Barcode">🖨️</button>
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
  if(document.getElementById('produkOperator')) document.getElementById('produkOperator').value = '';
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
 if(document.getElementById('produkOperator')) document.getElementById('produkOperator').value = '';
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
// function loadRiwayat(tipe) {
//   showLoading();
//   callAPI('getTransaksi', { tipe: tipe })
//     .then(result => {
//       hideLoading();
//       const tbodyId = tipe === 'MASUK' ? 'masuk-tbody' : 'keluar-tbody';
//       renderRiwayatTable(tbodyId, result.data || []);
//     })
//     .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
// }
// =============================================
// RIWAYAT
// =============================================
function loadRiwayat(tipe) {
  showLoading();
  callAPI('getTransaksi', { tipe: tipe })
    .then(result => {
      hideLoading();
      const tbodyId = tipe === 'MASUK' ? 'masuk-tbody' : 'keluar-tbody';
      const dataTransaksi = result.data || [];
      
      // Simpan data ke memori sesuai tipenya agar bisa difilter
      if (tipe === 'MASUK') {
        riwayatMasukData = dataTransaksi;
        const searchInput = document.getElementById('searchMasuk');
        if (searchInput) searchInput.value = '';
      } else if (tipe === 'KELUAR') {
        riwayatKeluarData = dataTransaksi;
        const searchInput = document.getElementById('searchKeluar');
        if (searchInput) searchInput.value = '';
      }

      renderRiwayatTable(tbodyId, dataTransaksi);
    })
    .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
}

function filterRiwayatMasuk() {
  const searchInput = document.getElementById('searchMasuk');
  if (!searchInput) return;
  const keyword = searchInput.value.toLowerCase().trim();

  const filteredData = riwayatMasukData.filter(t => {
    return (
      (t.namaProduk && t.namaProduk.toLowerCase().includes(keyword)) ||
      (t.barcode && String(t.barcode).toLowerCase().includes(keyword)) ||
      (t.timestamp && String(t.timestamp).toLowerCase().includes(keyword)) ||
      (t.jumlah && String(t.jumlah).toLowerCase().includes(keyword)) ||
      (t.catatan && t.catatan.toLowerCase().includes(keyword)) ||
      (t.operator && t.operator.toLowerCase().includes(keyword))
    );
  });
  renderRiwayatTable('masuk-tbody', filteredData);
}

// [FUNGSI BARU] Untuk filter Barang Keluar
function filterRiwayatKeluar() {
  const searchInput = document.getElementById('searchKeluar');
  if (!searchInput) return;
  const keyword = searchInput.value.toLowerCase().trim();

  const filteredData = riwayatKeluarData.filter(t => {
    return (
      (t.namaProduk && t.namaProduk.toLowerCase().includes(keyword)) ||
      (t.barcode && String(t.barcode).toLowerCase().includes(keyword)) ||
      (t.timestamp && String(t.timestamp).toLowerCase().includes(keyword)) ||
      (t.jumlah && String(t.jumlah).toLowerCase().includes(keyword)) ||
      (t.catatan && t.catatan.toLowerCase().includes(keyword)) ||
      (t.operator && t.operator.toLowerCase().includes(keyword))
    );
  });
  renderRiwayatTable('keluar-tbody', filteredData);
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
// function loadLokasi() {
//   showLoading();
//   callAPI('getSemuaLokasi')
//     .then(result => {
//       hideLoading();
//       lokasiData = result.data || [];
//       renderRakGrid();
//     })
//     .catch(err => { hideLoading(); showToast('Error: ' + err, 'error'); });
// }

// =============================================
// LOKASI / RAK (VERSI SAT-SET / CACHE FIRST)
// =============================================
function loadLokasi() {
  const CACHE_KEY = 'wms_cache_lokasi';
  
  // 1. CEK CACHE LOKAL
  const cachedData = localStorage.getItem(CACHE_KEY);
  if (cachedData) {
    try {
      lokasiData = JSON.parse(cachedData);
      renderRakGrid(); // Langsung susun peta rak dari memori
      console.log("⚡ Peta Rak dimuat instan!");
    } catch(e) {}
  } else {
    showLoading();
  }

  // 2. SINKRONISASI BACKGROUND
  callAPI('getSemuaLokasi')
    .then(result => {
      if (!cachedData) hideLoading();
      if (!result.success) return;

      // 3. UPDATE
      lokasiData = result.data || [];
      localStorage.setItem(CACHE_KEY, JSON.stringify(lokasiData));
      renderRakGrid(); // Gambar ulang peta rak jika ada barang yang pindah
    })
    .catch(err => { 
      if (!cachedData) {
        hideLoading(); 
        showToast('Error: ' + err, 'error'); 
      }
    });
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
// function handleModalBarcode(barcode) {
//   // ── MODE SCAN INFO (dari halaman Data Produk) ──
//   if (window._scanInfoMode) {
//     window._scanInfoMode = false;
//     showLoading();
//     Promise.all([
//       callAPI('getProdukByBarcode', barcode),
//       callAPI('getSemuaLokasi')
//     ]).then(([produkResult, lokasiResult]) => {
//       hideLoading();
//       const semuaLokasi = lokasiResult.data || [];

//       if (produkResult.success) {
//         const p = produkResult.data;
//         const lokasiProduk = semuaLokasi.filter(l => String(l.barcode) === String(barcode));
//         const totalStok = lokasiProduk.length > 0
//           ? lokasiProduk.reduce((sum, l) => sum + (parseInt(l.jumlah) || 0), 0)
//           : p.stok;
//         const lokasiStr = lokasiProduk.length > 0
//           ? lokasiProduk.map(l => `R${l.rak} L${l.lantai} B${l.baris} (${l.jumlah})`).join(' · ')
//           : 'Belum ada lokasi';

//         setTimeout(() => {
//           if (confirm(
//             `✅ Produk Ditemukan\n\n` +
//             `Nama   : ${p.nama}\n` +
//             `Stok   : ${totalStok} ${p.satuan}\n` +
//             `Lokasi : ${lokasiStr}\n\n` +
//             `Buka untuk diedit?`
//           )) {
//             editProdukById(p.id);
//           }
//         }, 100);

//       } else {
//         setTimeout(() => {
//           if (confirm(`❓ Barcode ${barcode} belum terdaftar.\nTambah sebagai produk baru?`)) {
//             openModalTambahProduk();
//             document.getElementById('produkBarcode').value = barcode;
//           }
//         }, 100);
//       }
//     }).catch(() => hideLoading());
//     return; // stop, jangan lanjut ke mode normal
//   }

//   // ── MODE NORMAL (dari modal Tambah/Edit Produk) ──
//   document.getElementById('produkBarcode').value = barcode;

//   showLoading();
//   callAPI('getProdukByBarcode', barcode)
//     .then(result => {
//       hideLoading();
//       if (result.success) {
//         const p = result.data;
//         // Produk sudah ada → switch ke mode Edit dan auto-fill semua field
//         document.getElementById('modalProdukTitle').textContent = 'EDIT PRODUK';
//         document.getElementById('editProdukId').value = p.id;
//         document.getElementById('produkBarcode').value = p.barcode;
//         document.getElementById('produkNama').value = p.nama;
//         document.getElementById('produkKategori').value = p.kategori || '';
//         document.getElementById('produkSatuan').value = p.satuan || 'pcs';
//         document.getElementById('produkStok').value = p.stok || 0;
//         document.getElementById('produkDeskripsi').value = p.deskripsi || '';
//         document.getElementById('produkRak').value = p.rak || '';
//         document.getElementById('produkLantai').value = p.lantai || '';
//         document.getElementById('produkBaris').value = p.baris || '';
//         showToast('Produk ditemukan — data terisi otomatis', 'info');
//       }
//     })
//     .catch(() => hideLoading());
// }
// =============================================
// HANDLE BARCODE DARI MINI SCANNER
// =============================================
function handleModalBarcode(barcode) {

  // ── 1. MODE QUICK SCAN GLOBAL (Dari Tombol Melayang HP) ──
  if (window._quickScanGlobalMode) {
    window._quickScanGlobalMode = false;
    
    // Pindah ke menu utama "Scan Barang"
    showPage('scan', null); 
    
    // [PERBAIKAN] Set tipe transaksi sesuai pilihan user di awal!
    if (window._quickScanTargetTipe) {
      setTipeTransaksi(window._quickScanTargetTipe);
    }
    
    // Isi input manual dan langsung proses pencarian barcodenya
    document.getElementById('manualBarcode').value = barcode;
    
    // Beri jeda 300ms agar halaman berganti dulu, baru mulai mencari data
    setTimeout(() => { 
      processBarcode(barcode); 
      window._quickScanTargetTipe = null; // Kosongkan memori setelah dipakai
    }, 300);
    
    return; // Berhenti di sini, jangan lanjut ke kode bawahnya
  }

  // ── 2. MODE SCAN INFO (dari halaman Data Produk) ──
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

        // Suntikkan data ke Modal Detail Produk
        document.getElementById('detailNama').textContent = p.nama;
        document.getElementById('detailBarcode').textContent = p.barcode;
        document.getElementById('detailKategori').textContent = p.kategori || 'Umum';
        
        const stokEl = document.getElementById('detailStok');
        stokEl.textContent = totalStok;
        stokEl.style.color = totalStok <= 0 ? 'var(--red)' : (totalStok <= 5 ? '#eab308' : 'var(--green)');
        
        document.getElementById('detailSatuan').textContent = p.satuan || 'pcs';

        // Render tabel multi-lokasi di dalam modal
        const lokasiContainer = document.getElementById('detailLokasiContainer');
        if (lokasiProduk.length === 0) {
          lokasiContainer.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px;border:1px dashed var(--border);border-radius:8px;">Belum ada data lokasi rak</div>`;
        } else {
          lokasiContainer.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
              <thead style="background:#eef0f6">
                <tr>
                  <th style="padding:10px;text-align:left;color:var(--text2);font-family:var(--font-display);letter-spacing:1px;">RAK</th>
                  <th style="padding:10px;text-align:left;color:var(--text2);font-family:var(--font-display);letter-spacing:1px;">LNT</th>
                  <th style="padding:10px;text-align:left;color:var(--text2);font-family:var(--font-display);letter-spacing:1px;">BRS</th>
                  <th style="padding:10px;text-align:right;color:var(--text2);font-family:var(--font-display);letter-spacing:1px;">JML</th>
                  <th style="padding:10px;text-align:center;color:var(--text2);font-family:var(--font-display);letter-spacing:1px;">AKSI</th>
                </tr>
              </thead>
              <tbody>
                ${lokasiProduk.map((l, i) => `
                  <tr style="border-top:1px solid var(--border); ${i % 2 === 0 ? 'background:#fff;' : 'background:#fafbfc;'}">
                    <td style="padding:10px;"><span style="background:var(--accent);color:#fff;border-radius:4px;padding:2px 6px;font-weight:700;">R${l.rak}</span></td>
                    <td style="padding:10px;font-weight:600;">L${l.lantai}</td>
                    <td style="padding:10px;font-weight:600;">B${l.baris}</td>
                    <td style="padding:10px;text-align:right;font-family:var(--font-mono);font-weight:700;color:var(--accent);font-size:14px;">${l.jumlah}</td>
                    <td style="padding:6px;text-align:center;">
                      <button class="btn btn-outline btn-sm btn-icon" style="padding:4px 8px;" title="Koreksi Stok" 
                        onclick="openEditStokLokasi('${l.rak}','${l.lantai}','${l.baris}','${p.barcode}','${p.nama.replace(/'/g, "\\'")}', ${l.jumlah})">✏️</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`;
        }

        document.getElementById('btnEditDetailProduk').onclick = function() {
          closeModal('modalDetailProduk');
          setTimeout(() => { editProdukById(p.id); }, 300); 
        };

        openModal('modalDetailProduk');

      } else {
        document.getElementById('notFoundScanInfoBarcodeText').textContent = barcode;
        document.getElementById('notFoundScanInfoBarcodeVal').value = barcode;
        openModal('modalNotFoundScanInfo');
      }
    }).catch(() => hideLoading());
    return; 
  }

  // ── 3. MODE NORMAL (dari modal Tambah/Edit Produk) ──
  document.getElementById('produkBarcode').value = barcode;

  showLoading();
  callAPI('getProdukByBarcode', barcode)
    .then(result => {
      hideLoading();
      if (result.success) {
        const p = result.data;
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
        
        if (document.getElementById('produkOperator') && p.operator) {
          document.getElementById('produkOperator').value = p.operator !== '—' ? p.operator : '';
        }
        
        showToast('Produk ditemukan — data terisi otomatis', 'info');
      }
    })
    .catch(() => hideLoading());
}

// =============================================
// QUICK SCAN DARI TOMBOL MELAYANG (FAB)
// =============================================
// =============================================
// QUICK SCAN DARI TOMBOL MELAYANG (FAB)
// =============================================
function quickScanGlobal() {
  // Buka modal pilihan transaksi terlebih dahulu
  openModal('modalQuickScanChoice');
}

// function startQuickScan(tipe) {
//   // Simpan tipe yang dipilih user ke dalam memori
//   window._quickScanTargetTipe = tipe;
  
//   // Tutup modal pilihan
//   closeModal('modalQuickScanChoice');
  
//   // Buka mini scanner dengan sedikit jeda agar animasi modal sebelumnya selesai
//   setTimeout(() => {
//     window._quickScanGlobalMode = true;
//     window._scanInfoMode = false;
//     openModal('modalMiniScan');
//     setTimeout(startMiniScanner, 300);
//   }, 300); 
// }

function startQuickScan(tipe) {
  // Simpan tipe yang dipilih user ke dalam memori
  window._quickScanTargetTipe = tipe;
  
  // [TAMBAHAN] Cek apakah Mode Beruntun dicentang
  const chk = document.getElementById('chkRapidScan');
  window._isRapidScanMode = chk ? chk.checked : false;
  
  // Tutup modal pilihan
  closeModal('modalQuickScanChoice');
  
  // Buka mini scanner dengan sedikit jeda
  setTimeout(() => {
    window._quickScanGlobalMode = true;
    window._scanInfoMode = false;
    openModal('modalMiniScan');
    setTimeout(startMiniScanner, 300);
  }, 300); 
}

// =============================================
// FUNGSI KOREKSI STOK LOKASI (DARI SCAN INFO)
// =============================================
function openEditStokLokasi(rak, lantai, baris, barcode, nama, jumlah) {
  document.getElementById('editStokLokasiLabel').textContent = `R${rak} L${lantai} B${baris}`;
  document.getElementById('editStokRak').value = rak;
  document.getElementById('editStokLantai').value = lantai;
  document.getElementById('editStokBaris').value = baris;
  document.getElementById('editStokBarcode').value = barcode;
  document.getElementById('editStokNama').value = nama;
  document.getElementById('editStokJumlah').value = jumlah;
  
  openModal('modalEditStokLokasi');
}

function saveEditStokLokasi() {
  const jumlah = parseInt(document.getElementById('editStokJumlah').value);
  if(isNaN(jumlah) || jumlah < 0) {
    showToast('Jumlah stok tidak valid', 'error'); return;
  }
  
  const data = {
    rak: document.getElementById('editStokRak').value,
    lantai: document.getElementById('editStokLantai').value,
    baris: document.getElementById('editStokBaris').value,
    barcode: document.getElementById('editStokBarcode').value,
    nama: document.getElementById('editStokNama').value,
    jumlah: jumlah
  };

  // Ubah tombol jadi "Menyimpan..." agar user tahu sedang proses
  const btn = document.querySelector('#modalEditStokLokasi .btn-primary');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Menyimpan...';
  btn.disabled = true;
  btn.style.opacity = '0.7';

  showLoading();

  callAPI('editStokLokasi', data)
    .then(res => {
      // Kembalikan tombol ke semula
      btn.innerHTML = originalText;
      btn.disabled = false;
      btn.style.opacity = '1';
      hideLoading();

      if(res.success) {
        showToast(res.message, 'success');
        closeModal('modalEditStokLokasi');
        
        // Refresh Modal Detail
        window._scanInfoMode = true; 
        handleModalBarcode(data.barcode); 
        
        // Refresh Tabel Utama
        if (currentPage === 'produk') {
          loadProduk();
        }
      } else {
        showToast('Gagal: ' + res.message, 'error');
      }
    }).catch(err => { 
      btn.innerHTML = originalText;
      btn.disabled = false;
      btn.style.opacity = '1';
      hideLoading(); 
      showToast('Error: '+err, 'error'); 
    });
}
// =============================================
// FUNGSI LANJUTAN DARI MODAL "TIDAK DITEMUKAN"
// =============================================
function proceedToTambahProduk() {
  // Ambil barcode dari input hidden di modal
  const barcode = document.getElementById('notFoundScanInfoBarcodeVal').value;
  closeModal('modalNotFoundScanInfo');
  
  // Tunggu animasi pop-up tertutup sebentar, lalu buka form tambah produk
  setTimeout(() => {
    openModalTambahProduk();
    document.getElementById('produkBarcode').value = barcode;
  }, 300);
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

// =============================================
// FITUR IMPORT EXCEL (.XLSX)
// =============================================
function openModalUpload() {
  const fileInput = document.getElementById('fileImportExcel');
  if(fileInput) fileInput.value = ''; // Reset input file
  openModal('modalUploadProduk');
}

function downloadTemplateExcel() {
  // Membuat struktur data untuk Excel
  const ws_data = [
    // Baris 1: Header (Judul Kolom)
    ["Barcode", "Nama Produk", "Kategori", "Satuan", "Stok Awal", "Rak", "Lantai", "Baris", "Deskripsi", "Operator"],
    // Baris 2: Contoh Data
    ["89912345678", "Contoh Barang", "ELEKTRONIK", "pcs", 50, "1", "1", "1", "Barang contoh import", "Admin"]
  ];
  
  // Menggunakan fungsi bawaan SheetJS untuk membuat file .xlsx
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  const wb = XLSX.utils.book_new();
  
  // Melebarkan kolom secara otomatis agar rapi di Excel
  ws['!cols'] = [
    {wch: 15}, {wch: 30}, {wch: 15}, {wch: 10}, {wch: 12}, 
    {wch: 8}, {wch: 8}, {wch: 8}, {wch: 25}, {wch: 15}
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Template_Produk");
  XLSX.writeFile(wb, "Template_Master_Produk.xlsx");
}

function processImportExcel() {
  const fileInput = document.getElementById('fileImportExcel');
  if (!fileInput || !fileInput.files.length) {
    showToast('Pilih file Excel terlebih dahulu!', 'error');
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();
  
  reader.onload = function(e) {
    // Membaca file Excel sebagai array buffer
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, {type: 'array'});
    
    // Ambil sheet pertama saja
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Konversi isi Excel menjadi format JSON (Array)
    const jsonArray = XLSX.utils.sheet_to_json(worksheet, {raw: false});
    
    if(jsonArray.length === 0) {
      showToast('Tidak ada data di dalam Excel!', 'error');
      return;
    }

    // Pemetaan data Excel ke format yang dimengerti oleh Backend kita
    const items = jsonArray.map(row => ({
      barcode: row['Barcode'] ? String(row['Barcode']).trim() : '',
      nama: row['Nama Produk'] ? String(row['Nama Produk']).trim() : '',
      kategori: row['Kategori'] ? String(row['Kategori']).trim() : 'UMUM',
      satuan: row['Satuan'] ? String(row['Satuan']).trim() : 'pcs',
      stok: parseInt(row['Stok Awal']) || 0,
      rak: row['Rak'] ? String(row['Rak']).trim() : '',
      lantai: row['Lantai'] ? String(row['Lantai']).trim() : '',
      baris: row['Baris'] ? String(row['Baris']).trim() : '',
      deskripsi: row['Deskripsi'] ? String(row['Deskripsi']).trim() : '',
      operator: row['Operator'] ? String(row['Operator']).trim() : 'Sistem Import'
    })).filter(item => item.barcode !== '' && item.nama !== ''); // Buang baris jika barcode/nama kosong

    if(items.length === 0) {
      showToast('Data tidak valid. Pastikan Barcode dan Nama terisi!', 'error');
      return;
    }

    // Ganti tombol jadi tulisan loading
    const btn = document.querySelector('#modalUploadProduk .btn-primary');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Memproses...';
    btn.disabled = true;

    showLoading();
    
    // Kirim data yang sudah rapi ke Backend
    callAPI('importProduk', items)
      .then(res => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        hideLoading();
        
        if(res.success) {
          showToast(res.message, 'success');
          closeModal('modalUploadProduk');
          loadProduk(); // Refresh tabel produk
        } else {
          showToast('Gagal: ' + res.message, 'error');
        }
      })
      .catch(err => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        hideLoading();
        showToast('Error: ' + err, 'error');
      });
  };
  
  reader.readAsArrayBuffer(file);
}


// =============================================
// FITUR CETAK LABEL BARCODE
// =============================================
function cetakBarcode(barcode, nama) {
  // Buka jendela baru khusus untuk format cetak printer
  const printWin = window.open('', '_blank');
  
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Cetak Label - ${nama}</title>
        <style>
          body { font-family: sans-serif; text-align: center; margin-top: 20px; }
          .label-box { 
            border: 2px solid #000; display: inline-block; 
            padding: 15px 20px; border-radius: 8px; max-width: 300px;
          }
          .nama-produk { 
            font-size: 16px; font-weight: bold; margin-bottom: 10px; 
            text-transform: uppercase; word-wrap: break-word;
          }
          @media print {
            @page { margin: 0; }
            body { margin: 5mm; }
            .label-box { border: none; padding: 0; } /* Hilangkan border saat diprint di stiker */
          }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
      </head>
      <body>
        <div class="label-box">
          <div class="nama-produk">${nama}</div>
          <svg id="barcodeSvg"></svg>
        </div>
        <script>
          // Render gambarnya
          JsBarcode("#barcodeSvg", "${barcode}", {
            format: "CODE128",
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 16,
            fontOptions: "bold"
          });
          // Otomatis panggil perintah Print setelah gambar siap
          setTimeout(() => { 
            window.print(); 
            window.close(); 
          }, 500);
        </script>
      </body>
    </html>
  `);
  printWin.document.close();
}

// =============================================
// HILANGKAN SPLASH SCREEN SAAT APLIKASI SIAP
// =============================================
window.addEventListener('load', function() {
  setTimeout(function() {
    const splash = document.getElementById('ios-splash');
    if (splash) {
      splash.style.opacity = '0'; // Buat memudar
      setTimeout(() => splash.remove(), 500); // Hapus dari layar
    }
  }, 800); // Tampil selama 0.8 detik
});