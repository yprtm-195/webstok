document.addEventListener('DOMContentLoaded', () => {

    // --- NEW: Global variable for pre-fetched data ---
    let ALL_STOCK_DATA = null;
    let MASTER_PRODUCT_LIST = [];
    
    // --- NEW: API and Cache URLs ---
    const CMS_API_URL = 'https://dashboard.myserverzone.my.id/api/live-stock';
    const CACHE_URL = 'live_stock.json';

    // --- NEW: Function to fetch primary data files with Fallback Logic ---
    const fetchPrimaryData = async () => {
        console.log('Fetching primary data...');
        let stockDataSource = '';
        
        // 1. Try to fetch from Live CMS API
        try {
            console.log(`Attempting to fetch from live API: ${CMS_API_URL}`);
            const stockResponse = await fetch(CMS_API_URL, {
                headers: { 'ngrok-skip-browser-warning': 'true' } // Header ini mungkin masih relevan jika domain di-proxy
            });

            if (stockResponse.ok) {
                ALL_STOCK_DATA = await stockResponse.json();
                stockDataSource = 'Live API';
                console.log('Successfully loaded data from Live API.');
            } else {
                throw new Error(`Live API failed with status: ${stockResponse.status}`);
            }
        } catch (apiError) {
            console.warn(`Live API fetch failed: ${apiError.message}. Falling back to local cache.`);
            
            // 2. Fallback to local live_stock.json
            try {
                console.log(`Attempting to fetch from local cache: ${CACHE_URL}`);
                const cacheResponse = await fetch(CACHE_URL);
                if (cacheResponse.ok) {
                    ALL_STOCK_DATA = await cacheResponse.json();
                    stockDataSource = 'Local Cache (live_stock.json)';
                    console.log('Successfully loaded data from local cache.');
                } else {
                    throw new Error(`Local cache failed with status: ${cacheResponse.status}`);
                }
            } catch (cacheError) {
                console.error(`CRITICAL: Both live API and local cache failed. Error: ${cacheError.message}`);
                ALL_STOCK_DATA = {}; // Set to empty object to prevent app from crashing
                stockDataSource = 'Failed';
            }
        }

        // Fetch other necessary files (listproduk.txt, update_status.json) in parallel
        try {
            const [productResponse, statusResponse] = await Promise.all([
                fetch('listproduk.txt'),
                fetch('update_status.json')
            ]);

            // Process listproduk.txt
            if (productResponse.ok) {
                const productListText = await productResponse.text();
                MASTER_PRODUCT_LIST = productListText.split('\n').slice(1).map(line => {
                    const [kodeproduk, ...rest] = line.trim().split(',');
                    return { kodeproduk, namaproduk: rest.join(',') };
                }).filter(p => p.kodeproduk);
                console.log(`Successfully loaded ${MASTER_PRODUCT_LIST.length} master products.`);
            } else {
                console.error("CRITICAL: Failed to load listproduk.txt.");
            }

            // Process update_status.json
            const updateStatusElement = document.getElementById('update-status');
            if (updateStatusElement) {
                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    const isoString = statusData.lastUpdated;
                    const datePart = isoString.split('T')[0];
                    const timePart = isoString.split('T')[1];
                    const [year, month, day] = datePart.split('-');
                    const [hour, minute] = timePart.split(':');
                    const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
                    const monthName = monthNames[parseInt(month, 10) - 1];
                    const formattedString = `${parseInt(day, 10)} ${monthName} ${year} ${hour}:${minute}`;
                    updateStatusElement.textContent = `Update Terakhir (${stockDataSource}): ${formattedString}`;
                } else {
                    updateStatusElement.textContent = `Sumber Data: ${stockDataSource}. Status update tidak tersedia.`;
                }
            }
        } catch (error) {
            console.error('An error occurred during secondary data fetch:', error);
            const updateStatusElement = document.getElementById('update-status');
            if (updateStatusElement) {
                updateStatusElement.textContent = 'Gagal memuat data pendukung.';
            }
        }
    };

    // --- Global Helper Functions ---
    const getFormattedDate = () => {
        const d = new Date();
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}${month}${year}`;
    };

    const downloadFile = (filename, content) => {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- CONTEXT-AWARE LOGIC ---
    fetchPrimaryData().then(() => {
        const statusContainer = document.getElementById('status-container');
        if (statusContainer) {
            runDirectExport();
        } else {
            initializeInteractivePage();
        }
    });

    // --- DIRECT EXPORT FUNCTIONS (MODIFIED) ---
    function runDirectExport() {
        const statusText = document.getElementById('status-text');
        const statusProgress = document.getElementById('status-progress');
        const urlParams = new URLSearchParams(window.location.search);
        const storeCode = urlParams.get('store');

        if (!storeCode) {
            statusText.textContent = 'Error: Parameter ?store=[kode_toko] tidak ada di URL.';
            statusProgress.remove();
            return;
        }

        statusText.textContent = `Menyiapkan data untuk toko ${storeCode}...`;
        
        const storeData = ALL_STOCK_DATA ? ALL_STOCK_DATA[storeCode.toUpperCase()] : null;

        if (!storeData) {
            statusText.innerHTML = `<strong>Waduh, Gagal!</strong><br>Data untuk toko ${storeCode} tidak ditemukan, baik di live API maupun di cache.`;
            statusProgress.remove();
            return;
        }
        
        // Data from cache is already in the desired format {kodeproduk, namaproduk, stock}
        const finalProductList = storeData.map(item => ({
            code: item.kodeproduk,
            name: item.namaproduk,
            stock: item.stock
        }));

        statusText.textContent = 'Sip, beres! Data siap diunduh.';
        statusProgress.value = 100;
        
        const header = 'kodeproduk,namaproduk,stok\n';
        const rows = finalProductList.map(p => `${p.code},"${p.name.replace(/"/g, '""')}",${p.stock}`).join('\n');
        downloadFile(`stok_${storeCode}_${getFormattedDate()}.csv`, header + rows);

        const img = document.createElement('img');
        img.src = 'sukses.gif';
        img.alt = 'Success!';
        img.className = 'mt-4';
        statusText.insertAdjacentElement('afterend', img);
    }

    // --- INTERACTIVE PAGE FUNCTIONS (MODIFIED) ---
    function initializeInteractivePage() {
        const fetchButton = document.getElementById('fetchButton');
        const storeCodeInput = document.getElementById('storeCodeInput');
        const tableContainer = document.getElementById('tableContainer');
        const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
        const autocompleteResults = document.getElementById('autocomplete-results');
        const resultsHeader = document.getElementById('results-header');
        const exportCsvButton = document.getElementById('export-csv');
        const exportExcelButton = document.getElementById('export-excel');

        let allStores = [];
        let selectedStoreInfo = { code: '', name: '' };
        let currentProductList = [];

        storeCodeInput.disabled = true;
        storeCodeInput.placeholder = "Mengambil daftar toko...";

        fetch('listtoko.txt')
            .then(response => {
                if (!response.ok) throw new Error(`Gagal mengambil listtoko.txt`);
                return response.text();
            })
            .then(text => {
                allStores = text.split('\n').slice(1).map(line => {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) return null;
                    const [code, ...nameParts] = trimmedLine.split(',');
                    const name = nameParts.join(',');
                    if (!code || !name) return null;
                    return { code, name };
                }).filter(s => s);

                storeCodeInput.disabled = false;
                storeCodeInput.placeholder = "Ketik nama atau kode toko...";
            })
            .catch(error => {
                console.error("Gagal memuat daftar toko:", error);
                storeCodeInput.placeholder = "Gagal mengambil daftar toko";
            });

        storeCodeInput.addEventListener('click', () => storeCodeInput.select());
        storeCodeInput.addEventListener('input', () => {
            selectedStoreInfo = { code: '', name: '' };
            const query = storeCodeInput.value.toLowerCase();
            if (query.length < 2) {
                autocompleteDropdown.classList.remove('is-active');
                return;
            }
            const filteredStores = allStores.filter(store => 
                store.name.toLowerCase().includes(query) || store.code.toLowerCase().includes(query)
            ).slice(0, 100);

            autocompleteResults.innerHTML = filteredStores.length > 0 ? filteredStores.map(store => 
                `<a href="#" class="dropdown-item" data-code="${store.code}" data-name="${store.name}">
                    ${store.name} <small>(${store.code})</small>
                </a>`
            ).join('') : '<p class="dropdown-item">Tidak ditemukan</p>';
            autocompleteDropdown.classList.add('is-active');
        });

        document.addEventListener('click', e => {
            if (!document.getElementById('autocomplete-wrapper').contains(e.target)) {
                autocompleteDropdown.classList.remove('is-active');
            }
        });

        autocompleteResults.addEventListener('click', e => {
            e.preventDefault();
            const target = e.target.closest('.dropdown-item');
            if (target && target.dataset.code) {
                selectedStoreInfo = { code: target.dataset.code, name: target.dataset.name };
                storeCodeInput.value = target.dataset.name;
                autocompleteDropdown.classList.remove('is-active');
                fetchButton.focus();
            }
        });

        fetchButton.addEventListener('click', fetchStockData);

        function fetchStockData() {
            const storeCode = (selectedStoreInfo.code || storeCodeInput.value.trim()).toUpperCase();
            if (!storeCode) {
                tableContainer.innerHTML = `<div class="notification is-warning is-light">Pilih dulu tokonya.</div>`;
                return;
            }
            if (!selectedStoreInfo.name || selectedStoreInfo.code !== storeCode) {
                const foundStore = allStores.find(s => s.code.toUpperCase() === storeCode);
                selectedStoreInfo = foundStore ? foundStore : { code: storeCode, name: storeCode };
            }

            tableContainer.innerHTML = '<progress class="progress is-large is-info" max="100">60%</progress>';
            resultsHeader.classList.add('is-hidden');
            
            const storeData = ALL_STOCK_DATA ? ALL_STOCK_DATA[storeCode] : null;

            if (!storeData) {
                handleError(new Error(`Data untuk toko ${storeCode} tidak ditemukan.`));
                return;
            }
            
            currentProductList = storeData.map(item => ({
                code: item.kodeproduk,
                name: item.namaproduk,
                stock: item.stock,
                image: 'oos.png' // placeholder
            }));
            
            renderCards(currentProductList);
            resultsHeader.classList.remove('is-hidden');
        }

        function renderCards(products) {
            if (products.length === 0) {
                tableContainer.innerHTML = `<div class="notification is-warning">List produk kosong atau data tidak ditemukan.</div>`;
                return;
            }
            const getStockTag = stock => {
                const num = parseInt(stock, 10);
                if (num === 0) return '<span class="tag is-danger is-light"><strong>Habis</strong></span>';
                if (num < 10) return `<span class="tag is-warning is-light"><strong>${num}</strong></span>`;
                return `<span class="tag is-success is-light"><strong>${num}</strong></span>`;
            };
            tableContainer.innerHTML = products.map(item => `
                <div class="box">
                    <article class="media">
                        <div class="media-left"><figure class="image is-64x64"><img src="${item.image}" alt="${item.name}" class="product-image"></figure></div>
                        <div class="media-content">
                            <div class="content">
                                <p class="is-size-7 has-text-grey-light mb-1">${item.code}</p>
                                <p class="mb-2"><strong>${item.name}</strong></p>
                                <p><span class="is-size-7 has-text-grey">Stok: </span>${getStockTag(item.stock)}</p>
                            </div>
                        </div>
                    </article>
                </div>
            `).join('');
        }

        function handleError(error) {
            console.error('Proses gagal:', error);
            tableContainer.innerHTML = `<div class="notification is-danger"><strong>Waduh, Gagal!</strong><p>${error.message}</p></div>`;
        }
        
        exportCsvButton.addEventListener('click', () => {
            const header = 'kodeproduk,namaproduk,stok\n';
            const rows = currentProductList.map(p => `${p.code},"${p.name.replace(/"/g, '""')}",${p.stock}`).join('\n');
            downloadFile(`stok_${selectedStoreInfo.code}_${getFormattedDate()}.csv`, header + rows);
        });

        exportExcelButton.addEventListener('click', () => {
            const headers = ['Kode Toko', 'Nama Toko', ...currentProductList.map(p => p.name.replace(/"/g, ''))];
            const values = [selectedStoreInfo.code, selectedStoreInfo.name, ...currentProductList.map(p => p.stock)];
            const csvContent = headers.join(',') + '\n' + values.join(',');
            downloadFile(`pivot_stok_${selectedStoreInfo.code}_${getFormattedDate()}.csv`, csvContent);
        });
    }
});