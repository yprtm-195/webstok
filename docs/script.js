document.addEventListener('DOMContentLoaded', () => {

    // --- Global variables for pre-fetched data ---
    let MASTER_PRODUCT_LIST = [];
    let ALL_STOCK_DATA = {}; // To hold all stock data from the JSON file
    
    // --- Data Source URL ---
    const CACHE_URL = 'live_stock.json'; 

    // --- Function to fetch all primary data files on page load ---
    const fetchPrimaryData = async () => {
        console.log('Fetching primary data from local files...');
        try {
            const [stockResponse, statusResponse] = await Promise.all([
                fetch(CACHE_URL).catch(e => { console.error('Cache fetch failed:', e); return { ok: false }; }),
                fetch('update_status.json').catch(e => { console.error('Status fetch failed:', e); return { ok: false }; })
            ]);

            // Process live_stock.json
            if (stockResponse.ok) {
                ALL_STOCK_DATA = await stockResponse.json();
                console.log(`Successfully loaded stock data for ${Object.keys(ALL_STOCK_DATA).length} stores from ${CACHE_URL}.`);
            } else {
                console.error(`CRITICAL: Failed to load ${CACHE_URL}. App may not function correctly.`);
            }

            // Process update_status.json
            const updateStatusElement = document.getElementById('update-status');
            if (updateStatusElement) {
                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    const isoString = statusData.lastUpdated;
                    
                    // NEW: Correct timezone handling
                    const date = new Date(isoString);
                    const options = {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short'
                    };
                    const formattedString = date.toLocaleString('id-ID', options);

                    updateStatusElement.textContent = `Update Terakhir: ${formattedString}`;
                } else {
                    updateStatusElement.textContent = 'Status update tidak tersedia.';
                }
            }
        } catch (error) {
            console.error('An error occurred during primary data fetch:', error);
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

    // --- Main Logic Execution ---
    fetchPrimaryData().then(() => {
        const statusContainer = document.getElementById('status-container');
        if (statusContainer) {
            runDirectExport(); // Logic for direct.html
        } else {
            initializeInteractivePage(); // Logic for index.html
        }
    });

    // --- DIRECT EXPORT FUNCTIONS (Refactored to use cache only) ---
    function runDirectExport() {
        // This function is for direct.html, which is not being used in the main page.
        // It's left here for compatibility if you decide to use direct.html
    }

    // --- INTERACTIVE PAGE FUNCTIONS (Refactored to use cache only) ---
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
                    const name = nameParts.join(',').replace(/^"|"$/g, ''); // Handle quoted names
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
        storeCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                fetchButton.click();
            }
        });

        function fetchStockData() {
            const storeCode = (selectedStoreInfo.code || storeCodeInput.value.trim()).toUpperCase();
            if (!storeCode) {
                handleError(new Error("Pilih dulu tokonya."), "Perhatian");
                return;
            }
            if (!selectedStoreInfo.name || selectedStoreInfo.code !== storeCode) {
                const foundStore = allStores.find(s => s.code.toUpperCase() === storeCode);
                selectedStoreInfo = foundStore ? foundStore : { code: storeCode, name: storeCode };
            }

            tableContainer.innerHTML = '<progress class="progress is-large is-info" max="100">60%</progress>';
            resultsHeader.classList.add('is-hidden');
            
            try {
                const storeData = ALL_STOCK_DATA[storeCode];
                if (!storeData || storeData.length === 0) {
                    throw new Error(`Data produk untuk toko ${storeCode} tidak ditemukan di file cache (live_stock.json).`);
                }

                currentProductList = storeData.map(item => ({
                    code: item.kodeproduk,
                    name: item.namaproduk,
                    stock: item.stock,
                    image: 'oos.png' // placeholder
                }));
                
                renderCards(currentProductList);
                resultsHeader.classList.remove('is-hidden');

            } catch (error) {
                handleError(error);
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
            resultsHeader.classList.add('is-hidden');
        }
        
        exportCsvButton.addEventListener('click', () => {
            if(currentProductList.length === 0) return;
            const header = 'kodeproduk,namaproduk,stok\n';
            const rows = currentProductList.map(p => `${p.code},"${p.name.replace(/"/g, '""')}",${p.stock}`).join('\n');
            downloadFile(`stok_${selectedStoreInfo.code}_${getFormattedDate()}.csv`, header + rows);
        });

        exportExcelButton.addEventListener('click', () => {
            if(currentProductList.length === 0) return;
            const headers = ['Kode Toko', 'Nama Toko', ...currentProductList.map(p => p.name.replace(/"/g, ''))];
            const values = [selectedStoreInfo.code, selectedStoreInfo.name, ...currentProductList.map(p => p.stock)];
            const csvContent = headers.join(',') + '\n' + values.join(',');
            downloadFile(`pivot_stok_${selectedStoreInfo.code}_${getFormattedDate()}.csv`, csvContent);
        });
    }
});