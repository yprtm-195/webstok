const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyzDz-T1b_7TbXtDJQ7zcpSO7vfhgrAeGo8b0Pnd3TU2_2LEHjTH_V36o07ZNiNU1SF/exec';
let allStores = [];
let hasAutoRefreshed = false;
let currentProductData = [];

// --- Helper Functions ---
function apiFetch(action, params = {}) {
  const url = new URL(GAS_API_URL);
  url.searchParams.append('action', action);
  for (const key in params) {
    url.searchParams.append(key, params[key]);
  }
  return fetch(url).then(res => res.json());
}

function showAlert(message, type = 'danger') {
  const cardList = document.getElementById('cardList');
  cardList.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  document.getElementById('result-card').style.display = 'block';
}

function showProgressBar(message) {
  const cardList = document.getElementById('cardList');
  cardList.innerHTML = `
    <div class="text-center my-3">
      <p>${message}</p>
      <div class="progress" role="progressbar" aria-label="Loading" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="height: 20px;">
        <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 100%"></div>
      </div>
    </div>
  `;
  document.getElementById('result-card').style.display = 'block';
}

// --- UI Rendering ---
function renderTable(data) {
  const cardList = document.getElementById('cardList');
  cardList.innerHTML = '';

  if (data.length === 0) {
    cardList.innerHTML = '<p class="text-center text-muted">Produk datanya gagal ditarik bang kosong.</p>';
    return;
  }

  const tableContainer = document.createElement('div');
  tableContainer.className = 'table-responsive';
  
  const table = document.createElement('table');
  table.className = 'table table-striped table-hover table-sm';
  
  table.innerHTML =
    '<thead class="table-light">' +
      '<tr>' +
        '<th scope="col"></th>' +
        '<th scope="col">Kode</th>' +
        '<th scope="col">Nama Produk</th>' +
        '<th scope="col">Stok</th>' +
        '<th scope="col">Tag</th>' +
        '<th scope="col">Harga</th>' +
      '</tr>' +
    '</thead>' +
    '<tbody>' +
    '</tbody>';

  const tbody = table.querySelector('tbody');
  data.forEach(item => {
    const row = tbody.insertRow();
    row.className = item.stock === 0 ? 'table-danger' : '';
    
    row.innerHTML = 
      '<td><img src="' + item.productImageThumbnail + '" alt="' + item.productName + '" class="product-img-table"></td>' +
      '<td><span class="badge bg-secondary">' + (item.productCode || 'N/A') + '</span></td>' +
      '<td>' + item.productName + '</td>' +
      '<td><h5><span class="badge ' + (item.stock > 0 ? 'bg-success' : 'bg-danger') + '">' + item.stock + '</span></h5></td>' +
      '<td>' + (item.tagProduct || '-') + '</td>' +
      '<td>Rp ' + item.normalPrice.toLocaleString('id-ID') + '</td>';
  });
  
  tableContainer.appendChild(table);
  cardList.appendChild(tableContainer);
}

// --- Autocomplete Logic ---
function setupAutocomplete() {
  const storeInput = document.getElementById('store');
  const autocompleteList = document.getElementById('autocomplete-list');

  storeInput.addEventListener('input', () => {
    const searchTerm = storeInput.value.toLowerCase();
    if (!searchTerm) {
      autocompleteList.innerHTML = '';
      return;
    }
    const filteredStores = allStores
      .filter(store => store.code.toLowerCase().includes(searchTerm) || store.name.toLowerCase().includes(searchTerm))
      .slice(0, 10); // Limit results

    autocompleteList.innerHTML = '';
    filteredStores.forEach(store => {
      const item = document.createElement('a');
      item.href = '#';
      item.className = 'list-group-item list-group-item-action';
      item.textContent = `${store.code} - ${store.name}`;
      item.addEventListener('click', (e) => {
        e.preventDefault();
        storeInput.value = `${store.code} - ${store.name}`;
        autocompleteList.innerHTML = '';
      });
      autocompleteList.appendChild(item);
    });
  });

  document.addEventListener('click', (e) => {
    if (!storeInput.contains(e.target)) {
      autocompleteList.innerHTML = '';
    }
  });
}

// --- Data Loading ---
async function loadInitialData() {
  try {
    const [branchRes, storeRes] = await Promise.all([
      apiFetch('getBranchList'),
      apiFetch('getStoreList')
    ]);

    // Populate branches
    const branchSelect = document.getElementById('branch');
    branchSelect.innerHTML = '<option selected disabled value="">-- Pilih Branch --</option>';
    if (branchRes.success) {
      branchRes.data.forEach(branch => {
        branchSelect.innerHTML += `<option value="${branch}">${branch}</option>`;
      });
    }

    // Setup stores for autocomplete
    if (storeRes.success) {
      allStores = storeRes.data;
      document.getElementById('store').disabled = false;
      setupAutocomplete();
    }
  } catch (err) {
    showAlert('Gagal memuat data awal. Coba refresh halaman.');
    console.error(err);
  }
}

// --- Main Execution Logic ---
async function executeStokCheck(isForDownload = false) {
  const branch = document.getElementById('branch').value;
  const storeInput = document.getElementById('store').value;
  
  // Determine which button to use
  const actionBtn = document.getElementById(isForDownload ? 'downloadLaporan' : 'cekStok');
  if (!actionBtn) return; // Safety check
  
  const spinner = actionBtn.querySelector('.spinner-border');

  if (!branch || !storeInput) {
    if (!hasAutoRefreshed) alert('Pilih branch dan toko dulu!');
    return;
  }

  actionBtn.disabled = true;
  spinner.style.display = 'inline-block';
  document.getElementById('result-card').style.display = 'block';
  
  const storeName = storeInput.split(' - ')[1] || storeInput;
  document.getElementById('judulStok').textContent = isForDownload ? 'Narik stok dulu...' : `Stok ${storeName}`;

  if (!hasAutoRefreshed) {
    showProgressBar('Bentar narik datanya dulu...');
  } else {
    showProgressBar('Sabar bang lagi nyoba narik datanya lagi...');
  }

  try {
    const storecode = storeInput.split(' - ')[0];
    const itemOrderRes = await apiFetch('getItemList');
    if (!itemOrderRes.success) throw new Error(itemOrderRes.error.message);
    
    const apiResponseRes = await apiFetch('getStokProduk', { storecode, branch });
    if (!apiResponseRes.success) throw new Error(apiResponseRes.error.message);
    if (apiResponseRes.data.error) throw new Error(`API Alfagift Error: ${apiResponseRes.data.message}`);

    const itemOrderList = itemOrderRes.data;
    const productsFromApi = apiResponseRes.data.data.listCartDetail || [];
    const apiProductsProcessed = productsFromApi.map(p => ({
      originalProduct: p,
      searchName: p.productName ? p.productName.trim().toLowerCase() : ''
    }));

    const finalProductList = itemOrderList.map(itemFromSheet => {
      const searchNameFromSheet = itemFromSheet.name.trim().toLowerCase();
      const foundApiProduct = apiProductsProcessed.find(p => p.searchName.includes(searchNameFromSheet));
      
      if (foundApiProduct) {
        const foundItem = foundApiProduct.originalProduct;
        return {
          productCode: itemFromSheet.code,
          productName: foundItem.productName,
          stock: foundItem.productStock?.stock ?? 0,
          tagProduct: foundItem.tagProduct || '-',
          normalPrice: foundItem.normalPrice || foundItem.alfacartPrice || 0,
          productImageThumbnail: foundItem.productImageThumbnail
        };
      } else {
        return {
          productCode: itemFromSheet.code,
          productName: itemFromSheet.name,
          stock: 0,
          tagProduct: '-',
          normalPrice: 0,
          productImageThumbnail: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRoTNL2Jk0oNIKQaFM6wPSTlLwEUQzYqTV7Gw&s'
        };
      }
    });

    if (!hasAutoRefreshed) {
      hasAutoRefreshed = true;
      setTimeout(() => executeStokCheck(isForDownload), 750);
    } else {
      currentProductData = finalProductList;
      actionBtn.disabled = false;
      spinner.style.display = 'none';

      if (isForDownload) {
        downloadAsCsv('stok.csv');
        showAlert('Stok berhasil ditarik.', 'success');
      } else {
        renderTable(finalProductList);
        // Collapse the "Pilih Toko" section on main page
        const collapsePilihTokoElement = document.getElementById('collapsePilihToko');
        if (collapsePilihTokoElement) {
          const bsCollapse = new bootstrap.Collapse(collapsePilihTokoElement, { toggle: false });
          bsCollapse.hide();
        }
      }
    }

  } catch (err) {
    showAlert(`Terjadi error: ${err.message}`);
    actionBtn.disabled = false;
    spinner.style.display = 'none';
    console.error(err);
  }
}

// --- Download Logic ---
function downloadAsXlsx(fileName) {
  if (currentProductData.length === 0) return alert('Data kosong.');
  const ws_data = [
    ["Kode Produk", "Nama Produk", "Stok", "Tag", "Harga"],
    ...currentProductData.map(item => [
      item.productCode,
      item.productName,
      item.stock,
      item.tagProduct,
      item.normalPrice
    ])
  ];
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stok");
  
  let finalFileName = fileName;
  if (!finalFileName) {
    const storeName = (document.getElementById('store').value.split(' - ')[1] || 'data').replace(/[^a-zA-Z0-9]/g, '_');
    const today = new Date();
    finalFileName = `stok_${storeName}_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}.xlsx`;
  }
  XLSX.writeFile(wb, finalFileName);
}

function downloadAsCsv(fileName) {
  if (currentProductData.length === 0) return alert('Data kosong.');
  let csvContent = "Kode Produk,Nama Produk,Stok\n";
  currentProductData.forEach(item => {
    const name = item.productName.includes(',') ? `"${item.productName}"` : item.productName;
    csvContent += `${item.productCode || ''},${name},${item.stock}\n`;
  });

  let finalFileName = fileName;
  if (!finalFileName) {
    const today = new Date();
    finalFileName = `stok_${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}${today.getFullYear()}.csv`;
  }
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", finalFileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  loadInitialData().then(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const branchCode = urlParams.get('branch');
    const storeCode = urlParams.get('store');

    if (branchCode && storeCode) {
      const branchSelect = document.getElementById('branch');
      const storeInput = document.getElementById('store');

      branchSelect.value = branchCode;

      const store = allStores.find(s => s.code === storeCode);
      if (store) {
        storeInput.value = `${store.code} - ${store.name}`;
      } else {
        storeInput.value = storeCode;
      }
      
      // Directly call the download logic instead of simulating a click
      hasAutoRefreshed = false;
      currentProductData = [];
      executeStokCheck(true); // true for download
    }
  });

  // Listener for index.html
  const cekStokBtn = document.getElementById('cekStok');
  if (cekStokBtn) {
    cekStokBtn.addEventListener('click', () => {
      hasAutoRefreshed = false;
      currentProductData = [];
      executeStokCheck(false);
    });
    document.getElementById('downloadExcel').addEventListener('click', () => downloadAsXlsx());
    document.getElementById('downloadCsv').addEventListener('click', () => downloadAsCsv());
  }

  // Listener for laporan.html
  const downloadLaporanBtn = document.getElementById('downloadLaporan');
  if (downloadLaporanBtn) {
    downloadLaporanBtn.addEventListener('click', () => {
      hasAutoRefreshed = false;
      currentProductData = [];
      executeStokCheck(true);
    });
  }

  // --- Collapse Icon Toggle ---
  const collapsePilihToko = document.getElementById('collapsePilihToko');
  const collapseIcon = document.getElementById('collapseIcon');

  if (collapsePilihToko && collapseIcon) {
    collapsePilihToko.addEventListener('shown.bs.collapse', () => {
      collapseIcon.classList.remove('bi-chevron-down');
      collapseIcon.classList.add('bi-chevron-up');
    });

    collapsePilihToko.addEventListener('hidden.bs.collapse', () => {
      collapseIcon.classList.remove('bi-chevron-up');
      collapseIcon.classList.add('bi-chevron-down');
    });
  }
});

// --- Prevent Accidental Refresh ---
window.addEventListener('beforeunload', function (e) {
  e.preventDefault();
  e.returnValue = '';
});
