const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxzf6uSbORvdU5bLk62UqAN5V2NibVpiqYvNdztzRLbIi0r0AGi49a53HZd8YVK1KY9/exec';
const FORCE_JSONP = false; 
let hasAutoRefreshed = false;
let currentProductData = [];

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

// --- Loading Container Functions ---
function showLoadingContainer(percentage, message) {
    const resultCard = document.getElementById('result-card');
    const loadingContainer = document.getElementById('loadingContainer');
    const resultContent = document.getElementById('resultContent');
    const progressBarInner = document.getElementById('progressBarInner');
    const progressBarText = document.getElementById('progressBarText');
    const progressMessage = document.getElementById('progressMessage');
    
    const sanitizedPercentage = Math.max(0, Math.min(100, Math.round(percentage)));

    // Show result card and loading container
    if (resultCard) resultCard.style.display = 'block';
    if (loadingContainer) loadingContainer.style.display = 'block';
    if (resultContent) resultContent.style.display = 'none';
    
    // Update progress bar
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

function hideLoadingContainer() {
    const loadingContainer = document.getElementById('loadingContainer');
    const resultContent = document.getElementById('resultContent');
    
    if (loadingContainer) loadingContainer.style.display = 'none';
    if (resultContent) resultContent.style.display = 'block';
}

// --- UI Feedback Functions ---
function showAlert(message, type = 'danger') {
  hideLoadingContainer(); // Ensure loading is hidden on alert
  const cardList = document.getElementById('cardList');
  const resultContent = document.getElementById('resultContent');
  
  if (resultContent) {
    resultContent.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    resultContent.style.display = 'block';
  } else if (cardList) {
    cardList.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  }
  document.getElementById('result-card').style.display = 'block';
}

function showSuccessAnimation(message) {
  hideLoadingContainer(); // Ensure loading is hidden on success
  const resultContent = document.getElementById('resultContent');
  const cardList = document.getElementById('cardList');
  
  const successHtml = `
    <div class="success-animation">
      <img src="sukses.gif" alt="Success!" class="success-gif mb-3" style="width: 140px; height: 140px;">
      <p class="fs-5 mt-3">${message}</p>
    </div>
  `;
  
  if (resultContent) {
    resultContent.innerHTML = successHtml;
    resultContent.style.display = 'block';
  } else if (cardList) {
    cardList.innerHTML = successHtml;
  }
  document.getElementById('result-card').style.display = 'block';
}

// --- Core Stock Fetching Logic (Reusable) ---
async function fetchAndProcessStock(branch, storeCode, storeName) {
    try {
        const itemOrderRes = await apiFetch('getItemList');
        if (!itemOrderRes.success) throw new Error(itemOrderRes.error.message);
        
        const apiResponseRes = await apiFetch('getStokProduk', { storecode: storeCode, branch: branch });
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
        return { success: true, products: finalProductList };

    } catch (err) {
        return { success: false, error: err.message };
    }
}

// --- Main Execution Logic (Single Store) ---
async function executeStokCheck(isForDownload = false) {
  const branch = document.getElementById('branch').value.trim().toUpperCase();
  const storeInput = document.getElementById('store').value.trim().toUpperCase();
  const actionBtn = document.getElementById('downloadLaporan');
  const spinner = actionBtn ? actionBtn.querySelector('.spinner-border') : null;

  if (!branch || !storeInput) {
    if (!isForDownload) alert('Pilih branch dan toko dulu!');
    return;
  }

  if(actionBtn) actionBtn.disabled = true;
  if(spinner) spinner.style.display = 'inline-block';
  
  const storeName = storeInput.split(' - ')[1] || storeInput;
  const storeCode = storeInput.split(' - ')[0];

  if (!hasAutoRefreshed) {
    document.getElementById('judulStok').textContent = 'Proses Download';
  }

  const isFirstRun = !hasAutoRefreshed;

  try {
    if (isFirstRun) {
      showLoadingContainer(10, `Mengambil daftar produk...`);
    } else {
      showLoadingContainer(60, `Mengambil ulang daftar produk untuk validasi...`);
    }

    const result = await fetchAndProcessStock(branch, storeCode, storeName);

    if (!result.success) {
        throw new Error(result.error);
    }
    currentProductData = result.products;

    if (isFirstRun) {
      hasAutoRefreshed = true;
      showLoadingContainer(50, 'Validasi... Menjalankan pengecekan kedua.');
      setTimeout(() => executeStokCheck(isForDownload), 750);
    } else {
      showLoadingContainer(100, 'Selesai!');

      if(actionBtn) actionBtn.disabled = false;
      if(spinner) spinner.style.display = 'none';

      setTimeout(() => {
        downloadAsCsv('stok.csv');
        showSuccessAnimation('Download CSV Berhasil!');
      }, 500);
    }

  } catch (err) {
    showAlert(`Terjadi error: ${err.message}`);
    if(actionBtn) actionBtn.disabled = false;
    if(spinner) spinner.style.display = 'none';
    console.error(err);
  }
}

// --- Download Logic ---
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
    const inputCard = document.getElementById('input-card');
    const resultCard = document.getElementById('result-card');
    const footerContent = document.querySelector('footer');
    const branchInput = document.getElementById('branch');
    const storeInput = document.getElementById('store');
    const downloadBtn = document.getElementById('downloadLaporan');

    if (storeInput) {
        storeInput.disabled = false;
    }
    
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => executeStokCheck(true));
    }

    const urlParams = new URLSearchParams(window.location.search);
    const branchCode = urlParams.get('branch');
    const storeCode = urlParams.get('store');

    // If parameters are present, hide the manual input UI and prepare result card for centering
    if (branchCode || storeCode) {
        if (inputCard) inputCard.style.display = 'none';
        if (footerContent) footerContent.style.display = 'none';
        if (resultCard) resultCard.classList.add('centered-result');
    }

    function startAutoDownload(branch, store) {
        if (branchInput && storeInput && downloadBtn) {
            branchInput.value = branch.toUpperCase();
            storeInput.value = store.toUpperCase();
            
            setTimeout(() => {
                downloadBtn.click();
            }, 250);
        }
    }

    if (storeCode && !branchCode) {
        showLoadingContainer(10, 'Mencari kode cabang untuk toko ' + storeCode.toUpperCase() + '...');
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
    const actionBtn = document.getElementById('downloadLaporan');
    if (actionBtn && actionBtn.disabled) {
        e.preventDefault();
        e.returnValue = '';
    }
});
