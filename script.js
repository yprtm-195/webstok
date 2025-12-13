document.addEventListener('DOMContentLoaded', () => {

    // --- NEW: Global variable for pre-fetched data ---
    let MASTER_PRODUCT_LIST = [];
    
    // --- NEW: API and Cache URLs ---
    const CMS_API_URL = 'https://dashboard.myserverzone.my.id/api/live-stock'; // Ini tetap untuk fallback atau data global (jika diperlukan untuk fitur lain)
    const CMS_STORE_API_URL = 'https://dashboard.myserverzone.my.id/api/live-stock-by-store'; // NEW: Untuk per toko spesifik
    const CACHE_URL = 'live_stock.json';

    // --- NEW: Function to fetch primary data files with Fallback Logic ---
    // Fungsi ini bisa jadi akan di-refactor ulang jika ALL_STOCK_DATA tidak lagi diperlukan
    // atau hanya di-load saat ada request spesifik ke global live-stock
    const fetchPrimaryData = async () => {
        console.log('Fetching primary data...');
        const stockDataSource = 'Live API'; // Sumber data sekarang selalu direct API

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
    async function runDirectExport() {
        const statusText = document.getElementById('status-text');
        const statusProgress = document.getElementById('status-progress');
        const urlParams = new URLSearchParams(window.location.search);
        const storeCode = urlParams.get('store');

        if (!storeCode) {
            statusText.textContent = 'Error: Parameter ?store=[kode_toko] tidak ada di URL.';
            if (statusProgress) statusProgress.remove();
            return;
        }

        const processAndDownload = (storeData, dataSource) => {
            statusText.textContent = `Memproses data dari ${dataSource}...`;
            if (statusProgress) statusProgress.value = 70;

            const finalProductList = storeData.map(item => ({
                code: item.kodeproduk,
                name: item.namaproduk,
                stock: item.stock
            }));

            statusText.textContent = `Sip, beres! Data dari ${dataSource} siap diunduh.`;
            if (statusProgress) statusProgress.value = 100;

            const header = 'kodeproduk,namaproduk,stok\n';
            const rows = finalProductList.map(p => `${p.code},"${p.name.replace(/"/g, '""')}",${p.stock}`).join('\n');
            downloadFile(`stok_${storeCode}_${getFormattedDate()}.csv`, header + rows);

            const img = document.createElement('img');
            img.src = 'sukses.gif';
            img.alt = 'Success!';
            img.className = 'mt-4';

            if (statusProgress) statusProgress.remove();
            statusText.insertAdjacentElement('afterend', img);
        };

        const fetchFromAPI = async () => {
            statusText.textContent = `Mengambil data dari API untuk toko ${storeCode}...`;
            if (statusProgress) statusProgress.value = 30;
            try {
                const response = await fetch(`${CMS_STORE_API_URL}/${storeCode.toUpperCase()}`);
                if (!response.ok) {
                    if (response.status === 404) throw new Error(`Data untuk toko ${storeCode} tidak ditemukan di API.`);
                    throw new Error(`Gagal mengambil data dari API (Status: ${response.status})`);
                }
                const data = await response.json();
                const storeData = data[storeCode.toUpperCase()];
                if (!storeData) throw new Error(`Struktur data API tidak sesuai.`);
                
                processAndDownload(storeData, 'API');

            } catch (error) {
                console.warn('API fetch failed for direct export, falling back to cache.', error);
                await fetchFromCache(storeCode); // Fallback to cache
            }
        };

        const fetchFromCache = async (code) => {
            statusText.textContent = `API gagal, mencoba mengambil data dari cache (live_stock.json) untuk toko ${code}...`;
            if (statusProgress) statusProgress.value = 50;
            try {
                const response = await fetch(CACHE_URL);
                if (!response.ok) throw new Error('Cache file (live_stock.json) tidak ditemukan atau tidak bisa dibaca.');
                const data = await response.json();
                const storeData = data[code.toUpperCase()];
                if (!storeData) throw new Error(`Data untuk toko ${code} tidak ditemukan di dalam cache.`);
                
                processAndDownload(storeData, 'Cache');

            } catch (cacheError) {
                handleError(cacheError, 'Gagal mengambil data dari API dan juga dari cache.');
            }
        };

        await fetchFromAPI();
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
            
            // --- MODIFIED FETCH LOGIC WITH FALLBACK ---
            fetch(`${CMS_STORE_API_URL}/${storeCode}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`API request failed with status ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    const storeData = data[storeCode]; 
                    if (!storeData) {
                         throw new Error('Struktur data API tidak sesuai atau data toko tidak ada.');
                    }
                    console.log(`Successfully fetched data for ${storeCode} from API.`);
                    processAndRender(storeData, 'API');
                })
                .catch(apiError => {
                    console.warn(`API fetch for ${storeCode} failed: ${apiError.message}. Falling back to cache.`);
                    fetchFromCache(storeCode);
                });
        }

        function fetchFromCache(storeCode) {
            fetch(CACHE_URL)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Cache file '${CACHE_URL}' tidak dapat dimuat.`);
                    }
                    return response.json();
                })
                .then(data => {
                    const storeData = data[storeCode];
                    if (!storeData) {
                        throw new Error(`Data untuk toko ${storeCode} tidak ditemukan di dalam cache.`);
                    }
                    console.log(`Successfully fetched data for ${storeCode} from Cache.`);
                    processAndRender(storeData, 'Cache');
                })
                .catch(cacheError => {
                    handleError(cacheError, `Gagal mengambil data dari API dan juga dari cache.`);
                });
        }

        function processAndRender(storeData, dataSource) {
             currentProductList = storeData.map(item => ({
                code: item.kodeproduk,
                name: item.namaproduk,
                stock: item.stock,
                image: 'oos.png' // placeholder
            }));
            
            renderCards(currentProductList);
            resultsHeader.classList.remove('is-hidden');
            
            const updateStatusElement = document.getElementById('update-status');
            if (updateStatusElement.textContent.includes('Update Terakhir')) {
                 updateStatusElement.textContent = updateStatusElement.textContent.replace(/\(.*\)/, `(${dataSource})`);
            } else {
                updateStatusElement.textContent = `Sumber Data: ${dataSource}. Status update tidak tersedia.`;
            }
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

        function handleError(error, customMessage) {
            console.error('Proses gagal:', error);
            const message = customMessage || 'Waduh, Gagal!';
            tableContainer.innerHTML = `<div class="notification is-danger"><strong>${message}</strong><p>${error.message}</p></div>`;
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