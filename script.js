const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxzf6uSbORvdU5bLk62UqAN5V2NibVpiqYvNdztzRLbIi0r0AGi49a53HZd8YVK1KY9/exec';
const FORCE_JSONP = false; 
let currentProductData = [];
let multiStoreCheckResults = []; // New global variable for multi-store results

// --- Helper Functions ---
function apiFetch(action, params = {}) {
  const url = new URL(GAS_API_URL);
  url.searchParams.append('action', action);
  for (const key in params) {
    url.searchParams.append(key, params[key]);
  }

  function doJsonp() {
    return new Promise((resolve, reject) => {
      const callbackName = 'jsonp_cb_' + Date.now() + '_' + Math.floor(Math.random()*10000);
      url.searchParams.set('callback', callbackName);
      const script = document.createElement('script');
      let timeoutId;
      window[callbackName] = (data) => {
        clearTimeout(timeoutId);
        try { delete window[callbackName]; } catch(_) { window[callbackName] = undefined; }
        script.remove();
        resolve(data);
      };
      script.onerror = () => {
        clearTimeout(timeoutId);
        try { delete window[callbackName]; } catch(_) { window[callbackName] = undefined; }
        script.remove();
        reject(new Error('JSONP load error'));
      };
      timeoutId = setTimeout(() => {
        try { delete window[callbackName]; } catch(_) { window[callbackName] = undefined; }
        script.remove();
        reject(new Error('JSONP timeout'));
      }, 15000);
      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  if (FORCE_JSONP) return doJsonp();

  return fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        return res.text().then(t => { throw new Error('Unexpected content-type: ' + ct + ' body: ' + t.slice(0,200)); });
      }
      return res.json();
    })
    .catch(err => {
      console.warn('[apiFetch] Fetch gagal, fallback JSONP. Action:', action, 'Err:', err.message);
      return doJsonp();
    });
}

// --- Global Progress Bar Functions ---
function showGlobalProgressBar(percentage, message) {
    const overlay = document.getElementById('globalLoadingOverlay');
    const progressBarInner = document.getElementById('globalProgressBarInner');
    const progressMessage = document.getElementById('globalProgressMessage');
    const progressBarText = progressBarInner ? progressBarInner.querySelector('.progress-bar-text') : null;
    const sanitizedPercentage = Math.max(0, Math.min(100, Math.round(percentage)));

    if (overlay) overlay.style.display = 'flex';
    if (progressBarInner) {
        progressBarInner.style.width = `${sanitizedPercentage}%`;
        progressBarInner.setAttribute('aria-valuenow', sanitizedPercentage);
    }
    if (progressBarText) {
        progressBarText.textContent = `${sanitizedPercentage}%`;
    }
    if (progressMessage) {
        progressMessage.innerHTML = message; // Use innerHTML to render <br> tags
    }
}

function hideGlobalProgressBar() {
    const overlay = document.getElementById('globalLoadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

// --- UI Feedback Functions ---
function showAlert(message, type = 'danger') {
  hideGlobalProgressBar(); // Ensure progress bar is hidden on alert
  const cardList = document.getElementById('cardList');
  cardList.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  document.getElementById('result-card').style.display = 'block';
}

function showSuccessAnimation(message) {
  hideGlobalProgressBar(); // Ensure progress bar is hidden on success
  const cardList = document.getElementById('cardList');
  cardList.innerHTML = `
    <div class="success-animation">
      <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
        <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
        <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
      </svg>
      <p class="fs-5 mt-3">${message}</p>
    </div>
  `;
  document.getElementById('result-card').style.display = 'block';
}

// --- UI Rendering ---
function renderTable(data) {
    const cardList = document.getElementById('cardList');

    if (!data || data.length === 0) {
        cardList.innerHTML = '<p class="text-center">Tidak ada data untuk ditampilkan.</p>';
        return;
    }

    let tableHtml = '<div class="table-responsive"><table class="table table-bordered table-hover"><thead><tr><th></th><th>Nama Produk</th><th>Stok</th></tr></thead><tbody>';

    data.forEach(item => {
        tableHtml += `
            <tr class="${item.stock === 0 ? 'table-danger' : ''}">
                <td><img src="${item.productImageThumbnail}" alt="${item.productName}" class="product-img-table"></td>
                <td>${item.productName}</td>
                <td><span class="badge bg-secondary">${item.stock}</span></td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table></div>';
    cardList.innerHTML = tableHtml;
}

function renderMultiStoreTable(data, targetElementId) {
    const targetElement = document.getElementById(targetElementId);
    if (!targetElement) return;

    if (!data || data.length === 0) {
        targetElement.innerHTML = '<p class="text-center">Tidak ada data untuk ditampilkan.</p>';
        return;
    }

    let tableHtml = '<div class="table-responsive"><table class="table table-bordered table-hover"><thead><tr><th></th><th>Nama Produk</th><th>Stok</th></tr></thead><tbody>';

    data.forEach(item => {
        tableHtml += `
            <tr class="${item.stock === 0 ? 'table-danger' : ''}">
                <td><img src="${item.productImageThumbnail}" alt="${item.productName}" class="product-img-table"></td>
                <td>${item.productName}</td>
                <td><span class="badge bg-secondary">${item.stock}</span></td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table></div>';
    targetElement.innerHTML = tableHtml;
}

// --- Autocomplete Logic ---
function setupAutocomplete() {
    const storeInput = document.getElementById('store');
    const autocompleteList = document.getElementById('autocomplete-list');

    if (!autocompleteList) return; // FIX: Exit if autocomplete list doesn't exist

    storeInput.addEventListener('input', () => {
        const query = storeInput.value.toLowerCase();
        if (query.length < 2) {
            autocompleteList.innerHTML = '';
            return;
        }

        const filteredStores = allStores.filter(store => 
            store.name.toLowerCase().includes(query) || store.code.toLowerCase().includes(query)
        );

        let listHtml = '';
        filteredStores.slice(0, 5).forEach(store => {
            listHtml += `<a href="#" class="list-group-item list-group-item-action" data-code="${store.code}" data-name="${store.name}">${store.code} - ${store.name}</a>`;
        });
        autocompleteList.innerHTML = listHtml;
    });

    autocompleteList.addEventListener('click', (e) => {
        e.preventDefault();
        if (e.target.matches('.list-group-item')) {
            const code = e.target.dataset.code;
            const name = e.target.dataset.name;
            storeInput.value = `${code} - ${name}`;
            autocompleteList.innerHTML = '';
        }
    });
}

function setupMultiStoreSearchAutocomplete() {
    const multiStoreSearchInput = document.getElementById('multiStoreSearch');
    const multiAutocompleteList = document.getElementById('multi-autocomplete-list');
    const downloadMultiExcelBtn = document.getElementById('downloadMultiExcel');

    multiStoreSearchInput.addEventListener('input', () => {
        const query = multiStoreSearchInput.value.toLowerCase();
        if (query.length < 2) {
            multiAutocompleteList.innerHTML = '';
            return;
        }

        const filteredResults = multiStoreCheckResults.filter(result => 
            result.storeName.toLowerCase().includes(query) || result.storeCode.toLowerCase().includes(query)
        );

        let listHtml = '';
        filteredResults.slice(0, 5).forEach(result => {
            listHtml += `<a href="#" class="list-group-item list-group-item-action" data-store-code="${result.storeCode}">${result.storeCode} - ${result.storeName} (${result.status})</a>`;
        });
        multiAutocompleteList.innerHTML = listHtml;
    });

    multiAutocompleteList.addEventListener('click', (e) => {
        e.preventDefault();
        if (e.target.matches('.list-group-item')) {
            const storeCode = e.target.dataset.storeCode;
            const selectedResult = multiStoreCheckResults.find(result => result.storeCode === storeCode);
            if (selectedResult) {
                renderMultiStoreTable(selectedResult.products, 'multiCardList');
                multiStoreSearchInput.value = `${selectedResult.storeCode} - ${selectedResult.storeName}`;
            }
            multiAutocompleteList.innerHTML = '';
        }
    });
}

// --- Data Loading ---
async function loadInitialData() {
    const branchSelect = document.getElementById('branch');
    const multiBranchSelect = document.getElementById('multiBranch');
    const storeInput = document.getElementById('store');

    try {
        const branchRes = await apiFetch('getBranchList');
        if (branchRes.success) {
            // FIX: Only populate if the element is a SELECT
            if (branchSelect && branchSelect.tagName === 'SELECT') {
                branchSelect.innerHTML = '<option selected disabled value="">Pilih Cabang</option>';
                branchRes.data.forEach(branch => {
                    branchSelect.innerHTML += `<option value="${branch}">${branch}</option>`;
                });
                branchSelect.disabled = false;
            }
            if (multiBranchSelect) { // This element only exists on index.html
                multiBranchSelect.innerHTML = '<option selected disabled value="">Pilih Cabang</option>';
                branchRes.data.forEach(branch => {
                    multiBranchSelect.innerHTML += `<option value="${branch}">${branch}
</option>`;
                });
                multiBranchSelect.disabled = false;
            }
        } else {
            if (branchSelect) branchSelect.innerHTML = '<option selected disabled value="">Gagal memuat</option>';
            if (multiBranchSelect) multiBranchSelect.innerHTML = '<option selected disabled value="">Gagal memuat</option>';
        }


        const storeRes = await apiFetch('getStoreList');
        if (storeRes.success) {
            allStores = storeRes.data;
            storeInput.disabled = false;
            setupAutocomplete();
        } else {
            storeInput.placeholder = 'Gagal memuat toko';
        }
    } catch (error) {
        console.error('Error loading initial data:', error);
        showAlert('Gagal memuat data awal. Coba refresh halaman.', 'danger');
    }
}

// --- Core Stock Fetching Logic (Reusable) ---
async function fetchAndProcessStock(branch, storeCode, storeName) {
    try {
        // This part stays the same: get the master list of items from GAS.
        const itemOrderRes = await apiFetch('getItemList');
        if (!itemOrderRes.success) throw new Error(itemOrderRes.error.message);
        
        // --- Start of Change ---
        // 1. Call the new API directly. CORS is now fixed on the server.
        const response = await fetch(`https://stok.myomv.cloud/api/cart?store_code=${storeCode}`);
        if (!response.ok) {
            throw new Error(`Gagal mengambil data dari API baru, status: ${response.status}`);
        }
        // 2. The data from the new API is a direct array of products.
        const productsFromApi = await response.json();
        // --- End of Change ---

        const itemOrderList = itemOrderRes.data; // Master list from the sheet.
        
        // Map the products from the new API to a format we can easily search.
        const apiProductsProcessed = productsFromApi.map(p => ({
          productCode: p.productCode,
          productName: p.productName,
          stock: p.stock,
          productImage: p.productImage,
          searchName: p.productName ? p.productName.trim().toLowerCase() : ''
        }));

        const finalProductList = itemOrderList.map(itemFromSheet => {
          const searchNameFromSheet = itemFromSheet.name.trim().toLowerCase();
          // Find the product from the API response that matches the name from the master list.
          const foundApiProduct = apiProductsProcessed.find(p => p.searchName.includes(searchNameFromSheet));
          
          if (foundApiProduct) {
            // If found, use the data from the new API.
            return {
              productCode: foundApiProduct.productCode,
              productName: foundApiProduct.productName,
              stock: foundApiProduct.stock ?? 0,
              tagProduct: '-', // Not available in the new API
              normalPrice: 0, // Not available in the new API
              // The old app used 'productImageThumbnail', let's stick to that for consistency.
              productImageThumbnail: foundApiProduct.productImage 
            };
          } else {
            // If not found in the API response, assume 0 stock.
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
        return { success: true, products: finalProductList };

    } catch (err) {
        return { success: false, error: err.message };
    }
}

// --- Main Execution Logic (Single Store) ---
async function executeStokCheck(isForDownload = false) {
  const branch = document.getElementById('branch').value;
  const storeInput = document.getElementById('store').value;
  const actionBtn = document.getElementById(isForDownload ? 'downloadLaporan' : 'cekStok');
  const spinner = actionBtn ? actionBtn.querySelector('.spinner-border') : null;

  if (!branch || !storeInput) {
    if (!isForDownload) alert('Pilih branch dan toko dulu!');
    return;
  }

  if(actionBtn) actionBtn.disabled = true;
  if(spinner) spinner.style.display = 'inline-block';
  
  const storeName = storeInput.split(' - ')[1] || storeInput;
  const storeCode = storeInput.split(' - ')[0].trim().toUpperCase();

  document.getElementById('judulStok').textContent = isForDownload ? 'Proses Download' : `Stok ${storeName}`;

  try {
    showGlobalProgressBar(25, `Mengambil daftar produk...`);

    const result = await fetchAndProcessStock(branch, storeCode, storeName);

    if (!result.success) {
        throw new Error(result.error);
    }
    currentProductData = result.products;

    showGlobalProgressBar(100, 'Selesai!');

    console.log('DEBUG: Single run complete. Final product list:', currentProductData);

    if(actionBtn) actionBtn.disabled = false;
    if(spinner) spinner.style.display = 'none';

    setTimeout(() => {
      if (isForDownload) {
        downloadAsCsv('stok.csv');
        showSuccessAnimation('Download CSV Berhasil!');
      } else {
        showSuccessAnimation('Pengecekan Stok Berhasil!');
        setTimeout(() => {
            renderTable(currentProductData);
            const collapsePilihTokoElement = document.getElementById('collapsePilihToko');
            if (collapsePilihTokoElement) {
                const bsCollapse = new bootstrap.Collapse(collapsePilihTokoElement, { toggle: false });
                bsCollapse.hide();
            }
        }, 1500);
      }
    }, 500);

  } catch (err) {
    showAlert(`Terjadi error: ${err.message}`);
    if(actionBtn) actionBtn.disabled = false;
    if(spinner) spinner.style.display = 'none';
    console.error(err);
  }
}

// --- Main Execution Logic (Multi Store) ---
async function executeMultiStokCheck() {
    const branch = document.getElementById('multiBranch').value;
    const multiStoreCodesInput = document.getElementById('multiStoreCodes').value;
    const actionBtn = document.getElementById('cekStokMulti');
    const spinner = actionBtn ? actionBtn.querySelector('.spinner-border') : null;
    const multiCardList = document.getElementById('multiCardList');
    const multiResultCard = document.getElementById('multi-result-card');

    if (!branch || !multiStoreCodesInput) {
        alert('Pilih cabang dan masukkan kode toko!');
        return;
    }

    if(actionBtn) actionBtn.disabled = true;
    if(spinner) spinner.style.display = 'inline-block';
    multiResultCard.style.display = 'block';
    multiCardList.innerHTML = ''; // Clear previous content

    const rawStoreCodes = multiStoreCodesInput.split(',');
    const storeCodes = rawStoreCodes.map(s => s.trim().toUpperCase()).filter(s => s);

    if (storeCodes.length === 0) {
        showAlert('Tidak ada kode toko yang valid ditemukan.', 'warning');
        if(actionBtn) actionBtn.disabled = false;
        if(spinner) spinner.style.display = 'none';
        return;
    }

    multiStoreCheckResults = []; // Clear previous results

    // Initialize progress bar for multi-store check
    const totalStores = storeCodes.length;
    let processedStores = 0;
    showGlobalProgressBar(0, `Memulai pengecekan ${totalStores} toko...`);

    for (let i = 0; i < totalStores; i++) {
        const storeCode = storeCodes[i];
        const storeInfo = allStores.find(s => s.code === storeCode);
        const storeName = storeInfo ? storeInfo.name : storeCode; // Use code if name not found

        const currentProgress = Math.floor(((i + 1) / totalStores) * 100);
        showGlobalProgressBar(currentProgress, `Mengecek toko ${i + 1} dari ${totalStores}:<br>${storeCode} - ${storeName}...`);

        const result = await fetchAndProcessStock(branch, storeCode, storeName);
        multiStoreCheckResults.push({
            storeCode: storeCode,
            storeName: storeName,
            branchCode: branch,
            status: result.success ? 'Berhasil' : 'Gagal',
            error: result.error || null,
            products: result.products || []
        });
    }

    if(actionBtn) actionBtn.disabled = false;
    if(spinner) spinner.style.display = 'none';

    // Final progress update and then clear progress bar
    showGlobalProgressBar(100, 'Pengecekan multi toko selesai!');
    setTimeout(() => {
        hideGlobalProgressBar();
        // Display summary of multi-store results
        let summaryHtml = '<h6 class="mb-3">Ringkasan Hasil Pengecekan Multi Toko:</h6><ul class="list-group mb-3">';
        multiStoreCheckResults.forEach(res => {
            summaryHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
                ${res.storeCode} - ${res.storeName}
                <span class="badge bg-${res.status === 'Berhasil' ? 'success' : 'danger'}">${res.status}</span>
            </li>`;
        });
        summaryHtml += '</ul>';
        multiCardList.innerHTML = summaryHtml;

        // Setup autocomplete for multi-store results
        setupMultiStoreSearchAutocomplete();

        // Auto-collapse multi-store card
        const collapseMultiElement = document.getElementById('collapseMultiToko');
        if (collapseMultiElement) {
            const bsCollapse = new bootstrap.Collapse(collapseMultiElement, { toggle: false });
            bsCollapse.hide();
        }

    }, 1000); // Show 100% for 1 second then clear
}

// --- Download Logic ---
function exportToExcel(products, branch, storeCode, storeName, fileName) {
    if (products.length === 0) {
        return alert('Tidak ada data produk untuk diunduh.');
    }

    const currentDate = new Date().toLocaleDateString('id-ID');

    const allProductNames = new Set();
    products.forEach(p => {
        allProductNames.add(p.productName);
    });

    const sortedProductNames = Array.from(allProductNames).sort();

    const excelData = [];
    // Add header row
    excelData.push(['Tanggal', 'Kode Cabang', 'Kode Toko', 'Nama Toko', ...sortedProductNames]);

    // Add data row for the current store
    const row = {
        'Tanggal': currentDate,
        'Kode Cabang': branch,
        'Kode Toko': storeCode,
        'Nama Toko': storeName
    };
    sortedProductNames.forEach(productName => {
        const product = products.find(p => p.productName === productName);
        row[productName] = product ? product.stock : 0;
    });
    excelData.push(Object.values(row));

    const worksheet = XLSX.utils.aoa_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stok Transpose");
    XLSX.writeFile(workbook, fileName || `stok_${storeName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
}

function downloadAsXlsx(fileName) {
    // This function now just calls the generic exportToExcel
    const branch = document.getElementById('branch').value;
    const storeInput = document.getElementById('store').value;
    const storeCode = storeInput.split(' - ')[0].trim().toUpperCase();
    const storeName = storeInput.split(' - ')[1] || storeInput;
    
    exportToExcel(currentProductData, branch, storeCode, storeName, fileName);
}

function downloadAsCsv(fileName) {
  console.log('DEBUG: downloadAsCsv called. Items to download:', currentProductData.length);
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

function downloadMultiStoreExcel() {
    if (multiStoreCheckResults.length === 0) {
        alert('Tidak ada data pengecekan multi toko untuk diunduh. Lakukan pengecekan multi toko terlebih dahulu.');
        return;
    }

    const allProductNames = new Set();
    multiStoreCheckResults.forEach(result => {
        result.products.forEach(p => {
            allProductNames.add(p.productName);
        });
    });

    const sortedProductNames = Array.from(allProductNames).sort();

    const excelData = [];
    // Add header row
    excelData.push(['Tanggal', 'Kode Cabang', 'Kode Toko', 'Nama Toko', ...sortedProductNames]);

    // Add data rows for all stores in multiStoreCheckResults
    multiStoreCheckResults.forEach(result => {
        const row = {
            'Tanggal': result.date || new Date().toLocaleDateString('id-ID'), // Use stored date or current date
            'Kode Cabang': result.branchCode,
            'Kode Toko': result.storeCode,
            'Nama Toko': result.storeName
        };
        sortedProductNames.forEach(productName => {
            const product = result.products.find(p => p.productName === productName);
            row[productName] = product ? product.stock : 0;
        });
        excelData.push(Object.values(row));
    });

    const worksheet = XLSX.utils.aoa_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stok Gabungan Multi");
    
    const today = new Date();
    const fileName = `stok_gabungan_multi_${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}${today.getFullYear()}.xlsx`;
    
    XLSX.writeFile(workbook, fileName);
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    loadInitialData();

    // Listener untuk direct.html
    const downloadLaporanBtn = document.getElementById('downloadLaporan');
    if (downloadLaporanBtn) {
        downloadLaporanBtn.addEventListener('click', () => executeStokCheck(true));
    }

    // Listener untuk index.html (dibuat lebih aman)
    const cekStokBtn = document.getElementById('cekStok');
    if (cekStokBtn) {
        cekStokBtn.addEventListener('click', () => executeStokCheck(false));
    }
    
    const downloadExcelBtn = document.getElementById('downloadExcel');
    if (downloadExcelBtn) {
        downloadExcelBtn.addEventListener('click', () => downloadAsXlsx());
    }

    const downloadCsvBtn = document.getElementById('downloadCsv');
    if (downloadCsvBtn) {
        downloadCsvBtn.addEventListener('click', () => downloadAsCsv());
    }

    const cekStokMultiBtn = document.getElementById('cekStokMulti');
    if (cekStokMultiBtn) {
        cekStokMultiBtn.addEventListener('click', executeMultiStokCheck);
    }

    const downloadMultiExcelBtn = document.getElementById('downloadMultiExcel');
    if (downloadMultiExcelBtn) {
        downloadMultiExcelBtn.addEventListener('click', downloadMultiStoreExcel);
    }

    const collapseElement = document.getElementById('collapsePilihToko');
    const collapseIcon = document.getElementById('collapseIcon');

    const collapseMultiElement = document.getElementById('collapseMultiToko');
    const collapseMultiIcon = document.getElementById('collapseMultiIcon');

    if (collapseElement && collapseIcon) {
        collapseElement.addEventListener('show.bs.collapse', function () {
            collapseIcon.classList.remove('bi-chevron-down');
            collapseIcon.classList.add('bi-chevron-up');
            // Collapse other card
            if (collapseMultiElement) {
                const bsCollapse = new bootstrap.Collapse(collapseMultiElement, { toggle: false });
                bsCollapse.hide();
            }
        });

        collapseElement.addEventListener('hide.bs.collapse', function () {
            collapseIcon.classList.remove('bi-chevron-up');
            collapseIcon.classList.add('bi-chevron-down');
        });
    }

    if (collapseMultiElement && collapseMultiIcon) {
        collapseMultiElement.addEventListener('show.bs.collapse', function () {
            collapseMultiIcon.classList.remove('bi-chevron-down');
            collapseMultiIcon.classList.add('bi-chevron-up');
            // Collapse other card
            if (collapseElement) {
                const bsCollapse = new bootstrap.Collapse(collapseElement, { toggle: false });
                bsCollapse.hide();
            }
        });

        collapseMultiElement.addEventListener('hide.bs.collapse', function () {
            collapseMultiIcon.classList.remove('bi-chevron-up');
            collapseMultiIcon.classList.add('bi-chevron-down');
        });
    }

  function startAutoDownload(branchCode, storeCode) {
    setTimeout(() => {
      const branchSelect = document.getElementById('branch');
      const storeInput = document.getElementById('store');
      if (!branchSelect || !storeInput) return;

      const upperBranchCode = branchCode.toUpperCase();
      branchSelect.value = upperBranchCode;

      const upperStoreCode = storeCode.toUpperCase();
      const store = allStores.find(s => s.code === upperStoreCode);
      storeInput.value = store ? `${store.code} - ${store.name}` : upperStoreCode;
      
      if (branchSelect.value === upperBranchCode && storeInput.value.startsWith(upperStoreCode)) {
          currentProductData = [];
          executeStokCheck(true);
      } else {
          showAlert('Gagal memulai download dari URL. Pastikan kode branch dan toko benar.');
      }
    }, 500); // Delay to ensure data is loaded
  }

    const urlParams = new URLSearchParams(window.location.search);
    const branchCode = urlParams.get('branch');
    const storeCode = urlParams.get('store');

    if (storeCode && !branchCode) {
      showGlobalProgressBar(10, 'Mencari kode cabang untuk toko ' + storeCode.toUpperCase() + '...');
      apiFetch('getBranchByStore', { storecode: storeCode })
        .then(res => {
          if (res.success && res.data.branch) {
            startAutoDownload(res.data.branch, storeCode);
          } else {
            throw new Error((res.error && res.error.message) || 'Kode cabang tidak ditemukan.');
          }
        })
        .catch(err => {
          showAlert('Gagal otomatis: ' + err.message);
          console.error(err);
        });
    } else if (branchCode && storeCode) {
      startAutoDownload(branchCode, storeCode);
    }
});

// --- Prevent Accidental Refresh ---
window.addEventListener('beforeunload', function (e) {
    const actionBtn = document.getElementById('cekStok');
    if (actionBtn && actionBtn.disabled) {
        e.preventDefault();
        e.returnValue = '';
    }
});
