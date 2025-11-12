document.addEventListener('DOMContentLoaded', () => {

    // --- NEW: Global variable for pre-fetched data ---
    let ALL_STOCK_DATA = null;
    let MASTER_PRODUCT_LIST = [];

    // --- NEW: Function to fetch primary data files ---
    const fetchPrimaryData = async () => {
        try {
            // Fetch all primary data files in parallel
            const [stockResponse, productResponse, statusResponse] = await Promise.all([
                fetch('live_stock.json'),
                fetch('listproduk.txt'),
                fetch('update_status.json') // Fetch update status
            ]);

            // Process live_stock.json
            if (stockResponse.ok) {
                ALL_STOCK_DATA = await stockResponse.json();
                console.log('Successfully loaded live_stock.json');
            } else {
                console.warn('Could not load live_stock.json. The app will run in full live API mode.');
                ALL_STOCK_DATA = {};
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
                console.error("CRITICAL: Failed to load listproduk.txt. The app may not function correctly.");
            }

            // Process update_status.json and display it
            const updateStatusElement = document.getElementById('update-status');
            if (updateStatusElement) {
                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    
                    // --- FIX: Manual date parsing to avoid timezone issues ---
                    const isoString = statusData.lastUpdated; // e.g., "2025-11-12T20:49:03.546720"
                    const datePart = isoString.split('T')[0]; // "2025-11-12"
                    const timePart = isoString.split('T')[1]; // "20:49:03.546720"

                    const [year, month, day] = datePart.split('-');
                    const [hour, minute] = timePart.split(':');

                    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
                    const monthName = monthNames[parseInt(month, 10) - 1];

                    const formattedString = `${parseInt(day, 10)} ${monthName} ${year} pukul ${hour}.${minute}`;
                    updateStatusElement.textContent = `Terakhir Update: ${formattedString}`;
                    // --- END FIX ---

                } else {
                    updateStatusElement.textContent = 'Status update tidak tersedia.';
                }
            }

        } catch (error) {
            console.error('An error occurred during primary data fetch:', error);
            if (!ALL_STOCK_DATA) ALL_STOCK_DATA = {};
            const updateStatusElement = document.getElementById('update-status');
            if (updateStatusElement) {
                updateStatusElement.textContent = 'Gagal memuat status update.';
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

    // --- Live API Fallback Function ---
    const fetchFromLiveAPI = (storeCode) => {
        console.warn(`Falling back to live API for store: ${storeCode}`);
        return fetch(`https://retractile-asha-guiltlessly.ngrok-free.dev/api/stok/${storeCode}`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        })
        .then(res => {
            if (!res.ok) return []; // Return empty on failure
            return res.json().then(data => {
                if (data.error || !Array.isArray(data)) {
                    console.error("Live API Error or malformed data:", data.error || 'Not an array');
                    return []; // Return empty array on API error
                }
                // Map new keys to old keys for compatibility
                return data.map(item => ({
                    code: item.kodeproduk,
                    name: item.namaproduk,
                    stock: item.stock,
                    image: 'oos.png' // Hardcode placeholder
                }));
            });
        })
        .then(apiData => {
            // Merge with master list to ensure all products are present
            const apiDataMap = new Map(apiData.map(item => [item.code, item]));
            return MASTER_PRODUCT_LIST.map(p => {
                const apiProduct = apiDataMap.get(p.kodeproduk);
                return {
                    code: p.kodeproduk,
                    name: apiProduct ? apiProduct.name : p.namaproduk,
                    image: 'oos.png',
                    stock: apiProduct ? apiProduct.stock : 0
                };
            });
        });
    };


    // --- CONTEXT-AWARE LOGIC ---
    // Pre-fetch data, then initialize the specific page logic
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
            statusText.textContent = 'Error: Eh, parameter ?store=[kode_toko] nggak ada di URL.';
            statusProgress.remove();
            return;
        }

        statusText.textContent = `Lagi narik data buat toko ${storeCode}...`;

        const cachedData = ALL_STOCK_DATA ? ALL_STOCK_DATA[storeCode] : null;

        let dataPromise;
        if (cachedData) {
            console.log(`Data for ${storeCode} found in live_stock.json. Generating CSV.`);
            // Data from cache is already in the desired format {kodeproduk, namaproduk, stock}
            const formattedData = cachedData.map(item => ({
                code: item.kodeproduk,
                name: item.namaproduk,
                stock: item.stock
            }));
            dataPromise = Promise.resolve(formattedData);
        } else {
            console.warn(`Data for ${storeCode} not in live_stock.json. Falling back to live API for direct export.`);
            dataPromise = fetchFromLiveAPI(storeCode);
        }

        dataPromise.then(finalProductList => {
            statusText.textContent = 'Sip, beres! Stoknya udah ditarik';
            statusProgress.value = 100;
            
            const header = 'kodeproduk,namaproduk,stok\n';
            const rows = finalProductList.map(p => `${p.code},"${p.name.replace(/"/g, '""')}",${p.stock}`).join('\n');
            downloadFile(`stok_${getFormattedDate()}.csv`, header + rows);

            // Add a success image or message
            const img = document.createElement('img');
            img.src = 'sukses.gif';
            img.alt = 'Success!';
            img.className = 'mt-4';
            statusText.insertAdjacentElement('afterend', img);

        }).catch(error => {
            statusText.innerHTML = `<strong>Waduh, Gagal!</strong><br>${error.message}`;
            statusProgress.remove();
        });
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
        storeCodeInput.placeholder = "Bentar, lagi ngambil daftar toko...";

        fetch('listtoko.txt')
            .then(response => {
                if (!response.ok) throw new Error(`Gagal ngambil listtoko.txt`);
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

                if (allStores.length > 0) {
                    storeCodeInput.disabled = false;
                    storeCodeInput.placeholder = "Ketik nama atau kode toko...";
                } else {
                    storeCodeInput.placeholder = "Waduh, gagal proses daftar toko";
                }
            })
            .catch(error => {
                console.error("Gagal memuat daftar toko:", error);
                storeCodeInput.placeholder = "Waduh, gagal ngambil daftar toko";
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

            if (filteredStores.length === 0) {
                autocompleteDropdown.classList.remove('is-active');
                return;
            }
            autocompleteResults.innerHTML = filteredStores.map(store => 
                `<a href="#" class="dropdown-item" data-code="${store.code}" data-name="${store.name}">
                    ${store.name} <small>(${store.code})</small>
                </a>`
            ).join('');
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
            if (target) {
                selectedStoreInfo = { code: target.dataset.code, name: target.dataset.name };
                storeCodeInput.value = target.dataset.name;
                autocompleteDropdown.classList.remove('is-active');
            }
        });

        fetchButton.addEventListener('click', fetchStockData);

        function fetchStockData() {
            const storeCode = selectedStoreInfo.code || storeCodeInput.value.trim();
            if (!storeCode) {
                tableContainer.innerHTML = `<div class="notification is-warning is-light">Pilih dulu tokonya yang bener, bro.</div>`;
                return;
            }
            if (!selectedStoreInfo.name) {
                const foundStore = allStores.find(s => s.code.toLowerCase() === storeCode.toLowerCase());
                selectedStoreInfo = foundStore ? foundStore : { code: storeCode, name: storeCode };
            }

            tableContainer.innerHTML = '<progress class="progress is-large is-info" max="100">60%</progress>';
            resultsHeader.classList.add('is-hidden');

            const cachedData = ALL_STOCK_DATA ? ALL_STOCK_DATA[storeCode] : null;

            let dataPromise;
            if (cachedData) {
                 console.log(`Rendering data for ${storeCode} from live_stock.json.`);
                 const formattedData = cachedData.map(item => ({
                    code: item.kodeproduk,
                    name: item.namaproduk,
                    stock: item.stock,
                    image: 'oos.png' // hardcoded placeholder
                }));
                 dataPromise = Promise.resolve(formattedData);
            } else {
                dataPromise = fetchFromLiveAPI(storeCode);
            }
            
            dataPromise.then(products => {
                currentProductList = products;
                renderCards(currentProductList);
                resultsHeader.classList.remove('is-hidden');
            }).catch(handleError);
        }

        function renderCards(products) {
            if (products.length === 0) {
                tableContainer.innerHTML = `<div class="notification is-warning">List produknya kosong atau datanya gak ketemu nih.</div>`;
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
        
        // Export functions now use the 'currentProductList' which is already populated
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