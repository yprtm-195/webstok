const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyzDz-T1b_7TbXtDJQ7zcpSO7vfhgrAeGo8b0Pnd3TU2_2LEHjTH_V36o07ZNiNU1SF/exec';
let allStores = [];
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

function showAlert(message, type = 'info') {
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
  // This function is for browser display only, not used in app mode
  const cardList = document.getElementById('cardList');
  cardList.innerHTML = '';
  if (data.length === 0) {
    cardList.innerHTML = '<p class="text-center text-muted">Produk tidak ditemukan.</p>';
    return;
  }
  // ... (table rendering logic remains the same)
}

// --- Autocomplete Logic ---
function setupAutocomplete() {
  // ... (remains the same)
}

// --- Data Loading for Manual/Browser Mode ---
async function loadInitialData() {
  // ... (remains the same)
}

// --- Main Execution Logic (Refactored) ---
async function executeStokCheck(isForApp, branchCode, storeCode) {
  const branch = branchCode || document.getElementById('branch').value;
  const store = storeCode || (document.getElementById('store').value.split(' - ')[0]);

  if (!branch || !store) {
    if (!isForApp) alert('Pilih branch dan toko dulu!');
    return;
  }

  showProgressBar(isForApp ? 'Mengambil data stok...' : 'Bentar narik datanya dulu...');

  try {
    const itemOrderRes = await apiFetch('getItemList');
    if (!itemOrderRes.success) throw new Error(itemOrderRes.error.message);

    const apiResponseRes = await apiFetch('getStokProduk', { storecode: store, branch });
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
          stock: foundItem.productStock?.stock ?? 0
        };
      } else {
        return {
          productCode: itemFromSheet.code,
          productName: itemFromSheet.name,
          stock: 0
        };
      }
    });

    // --- DATA IS READY, NOW DECIDE WHAT TO DO ---
    let csvContent = "Kode Produk,Nama Produk,Stok\n";
    finalProductList.forEach(item => {
        const name = item.productName.includes(',') ? `\"${item.productName}\"` : item.productName;
        csvContent += `${item.productCode || ''},${name},${item.stock}\n`;
    });

    if (isForApp && typeof Android !== "undefined" && Android.processStockData) {
        // Send data to the Android app
        Android.processStockData(csvContent);
    } else {
        // Fallback for browser: render table or download
        currentProductData = finalProductList;
        renderTable(finalProductList);
        showAlert('Data berhasil ditampilkan.', 'success');
    }

  } catch (err) {
    showAlert(`Terjadi error: ${err.message}`);
    console.error(err);
  }
}

// --- Download Logic (for browser fallback) ---
function downloadAsCsv(fileName) {
    // ... (remains the same)
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  // ANDROID APP AUTOMATION FLOW
  if (typeof Android !== "undefined" && Android.getBranchCode) {
    document.body.classList.add('android-app');
    const branch = Android.getBranchCode();
    const store = Android.getStoreCode();
    
    if (branch && store) {
      executeStokCheck(true, branch, store);
    } else {
      showAlert('Gagal mendapatkan data dari aplikasi Android.');
    }
  } 
  // BROWSER/MANUAL FLOW
  else {
    loadInitialData();
    const downloadLaporanBtn = document.getElementById('downloadLaporan');
    if (downloadLaporanBtn) {
      downloadLaporanBtn.addEventListener('click', () => {
        executeStokCheck(false); // false because it's not for the app
      });
    }
  }
});
