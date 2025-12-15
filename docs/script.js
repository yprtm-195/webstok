document.addEventListener('DOMContentLoaded', () => {

    let ALL_STOCK_DATA = {};
    const CACHE_URL = 'live_stock.json'; 

    const fetchPrimaryData = async () => {
        console.log('Fetching primary data...');
        try {
            const [stockResponse, statusResponse] = await Promise.all([
                fetch(CACHE_URL).catch(e => ({ ok: false, error: e })),
                fetch('update_status.json').catch(e => ({ ok: false, error: e }))
            ]);

            if (stockResponse.ok) {
                ALL_STOCK_DATA = await stockResponse.json();
                console.log(`Successfully loaded stock data for ${Object.keys(ALL_STOCK_DATA).length} stores.`);
            } else {
                console.error(`CRITICAL: Failed to load ${CACHE_URL}.`);
            }

            const updateStatusElement = document.getElementById('update-status');
            if (updateStatusElement) {
                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    const date = new Date(statusData.lastUpdated);
                    const options = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' };
                    updateStatusElement.textContent = `Update Terakhir: ${date.toLocaleString('id-ID', options)}`;
                } else {
                    updateStatusElement.textContent = 'Status update tidak tersedia.';
                }
            }
        } catch (error) {
            console.error('Error during primary data fetch:', error);
            const updateStatusElement = document.getElementById('update-status');
            if (updateStatusElement) {
                updateStatusElement.textContent = 'Gagal memuat data pendukung.';
            }
        }
    };

    const getFormattedDate = () => {
        const d = new Date();
        return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
    };

    const downloadFile = (filename, content) => {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    function runDirectExport() {
        const statusText = document.getElementById('status-text');
        const statusProgress = document.getElementById('status-progress');
        const urlParams = new URLSearchParams(window.location.search);
        const storeCode = urlParams.get('store');

        if (!storeCode) {
            statusText.textContent = 'Error: Parameter ?store=[kode_toko] tidak ada di URL.';
            if (statusProgress) statusProgress.style.display = 'none';
            return;
        }

        statusText.textContent = `Mencari data untuk toko ${storeCode}...`;
        if (statusProgress) statusProgress.value = 30;

        try {
            if (Object.keys(ALL_STOCK_DATA).length === 0) throw new Error(`Cache live_stock.json kosong atau belum termuat.`);
            
            const storeData = ALL_STOCK_DATA[storeCode.toUpperCase()];
            if (!storeData) throw new Error(`Data untuk toko ${storeCode} tidak ditemukan di file live_stock.json.`);

            statusText.textContent = `Memproses data...`;
            if (statusProgress) statusProgress.value = 70;

            const header = 'kodeproduk,namaproduk,stok\n';
            let csvRows = [];

            // NEW: Handle multiple product codes
            storeData.forEach(p => {
                if (Array.isArray(p.kodeproduk)) {
                    p.kodeproduk.forEach(code => {
                        csvRows.push(`${code},"${p.namaproduk.replace(/\n/g, '\\n')}",${p.stock}`);
                    });
                } else {
                    csvRows.push(`${p.kodeproduk},"${p.namaproduk.replace(/\n/g, '\\n')}",${p.stock}`);
                }
            });

            downloadFile(`stok_${storeCode}_${getFormattedDate()}.csv`, header + csvRows.join('\n'));
            
            statusText.textContent = `Sip, beres! Data siap diunduh.`;
            if (statusProgress) statusProgress.value = 100;

            const img = document.createElement('img');
            img.src = 'sukses.gif';
            img.alt = 'Success!';
            img.className = 'mt-4';
            statusText.insertAdjacentElement('afterend', img);

        } catch (error) {
            console.error('Proses direct export gagal:', error);
            statusText.textContent = `Waduh, Gagal! ${error.message}`;
        } finally {
            if (statusProgress) statusProgress.style.display = 'none';
        }
    }

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
                    const name = nameParts.join(',').replace(/^"|"$/g, '');
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
                    // Handle single or multiple codes for display
                    code: Array.isArray(item.kodeproduk) ? item.kodeproduk.join(', ') : item.kodeproduk,
                    name: item.namaproduk,
                    stock: item.stock,
                    image: 'oos.png'
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

    // --- Main Logic Execution ---
    fetchPrimaryData().then(() => {
        if (document.getElementById('status-container')) {
            runDirectExport();
        } else {
            initializeInteractivePage();
        }
    });
});
