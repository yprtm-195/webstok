document.addEventListener('DOMContentLoaded', () => {

    // --- NEW: Global variable for pre-fetched data ---
    let MASTER_PRODUCT_LIST = [];
    let ALL_STOCK_DATA = {}; // NEW: To hold all stock data from the JSON file
    
    // --- API and Cache URLs ---
    const CMS_API_URL = 'https://dashboard.myserverzone.my.id/api/live-stock'; // Fallback (not primary)
    const CACHE_URL = 'live_stock.json'; // CHANGED: This is now the primary data source

    // --- Function to fetch primary data files ---
    const fetchPrimaryData = async () => {
        console.log('Fetching primary data from local files...');
        let stockDataSource = 'Cache'; // CHANGED: Default to cache

        try {
            // Fetch all necessary files in parallel: live_stock.json, listproduk.txt, update_status.json
            const [stockResponse, productResponse, statusResponse] = await Promise.all([
                fetch(CACHE_URL).catch(e => { console.error('Cache fetch failed:', e); return { ok: false }; }),
                fetch('listproduk.txt').catch(e => { console.error('Product list fetch failed:', e); return { ok: false }; }),
                fetch('update_status.json').catch(e => { console.error('Status fetch failed:', e); return { ok: false }; })
            ]);

            // Process live_stock.json
            if (stockResponse.ok) {
                ALL_STOCK_DATA = await stockResponse.json();
                console.log(`Successfully loaded stock data for ${Object.keys(ALL_STOCK_DATA).length} stores from ${CACHE_URL}.`);
            } else {
                console.error(`CRITICAL: Failed to load ${CACHE_URL}. App may not function correctly.`);
                stockDataSource = 'Not Available';
            }

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

        statusText.textContent = `Mengambil data untuk toko ${storeCode}...`;
        if (statusProgress) statusProgress.value = 30;

        try {
            // NEW: Get data from the pre-loaded cache
            const storeData = ALL_STOCK_DATA[storeCode.toUpperCase()];

            if (!storeData) {
                throw new Error(`Data untuk toko ${storeCode} tidak ditemukan di cache (file live_stock.json).`);
            }

            if (statusProgress) statusProgress.value = 70;
            statusText.textContent = 'Memproses data...';

            const finalProductList = storeData.map(item => ({
                code: item.kodeproduk,
                name: item.namaproduk,
                stock: item.stock
            }));

            statusText.textContent = 'Sip, beres! Data siap diunduh.';
            if (statusProgress) statusProgress.value = 100;
            
            const header = 'kodeproduk,namaproduk,stok\n';
            const rows = finalProductList.map(p => `${p.code},"${p.name.replace(/"/g, '""')}",${p.stock}`).join('\n');
            downloadFile(`stok_${storeCode}_${getFormattedDate()}.csv`, header + rows);

            const img = document.createElement('img');
            img.src = 'sukses.gif';
            img.alt = 'Success!';
            img.className = 'mt-4';

            // Hapus progress bar sebelum menampilkan gambar sukses
            if (statusProgress) statusProgress.remove();
            statusText.insertAdjacentElement('afterend', img);

        } catch (error) {
            console.error('Direct export failed:', error);
            statusText.innerHTML = `<strong>Waduh, Gagal!</strong><br>${error.message}`;
            if (statusProgress) statusProgress.remove();
        }
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
            
            // NEW: Get data from the pre-loaded cache
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
