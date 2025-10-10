document.addEventListener('DOMContentLoaded', () => {

    // --- Global State & Helpers ---
    let allStockData = null;
    let allStores = [];
    let allProducts = [];

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

    // --- Main Initialization ---
    const statusContainer = document.getElementById('status-container');
    if (statusContainer) {
        // --- DIRECT EXPORT PAGE LOGIC (direct.html) ---
        initializeData().then(runDirectExport).catch(handleFatalError);
    } else {
        // --- INTERACTIVE PAGE LOGIC (index.html) ---
        initializeData().then(initializeInteractivePage).catch(handleFatalError);
    }

    // --- DATA INITIALIZATION ---
    function initializeData() {
        return Promise.all([
            fetch('listtoko.txt').then(res => res.ok ? res.text() : Promise.reject('Gagal ambil listtoko.txt')),
            fetch('listproduk.txt').then(res => res.ok ? res.text() : Promise.reject('Gagal ambil listproduk.txt')),
            fetch('live_stock.json').then(res => res.ok ? res.json() : Promise.reject('Gagal ambil live_stock.json'))
        ]).then(([tokoText, produkText, stockJSON]) => {
            allStores = tokoText.split('\n').slice(1).map(line => {
                const [code, ...nameParts] = line.trim().split(',');
                return code && nameParts.length > 0 ? { code, name: nameParts.join(',') } : null;
            }).filter(Boolean);

            allProducts = produkText.split('\n').slice(1).map(line => {
                const [kodeproduk, ...rest] = line.trim().split(',');
                return kodeproduk ? { kodeproduk, namaproduk: rest.join(',') } : null;
            }).filter(Boolean);

            allStockData = stockJSON;
        });
    }

    function handleFatalError(error) {
        const container = statusContainer || document.getElementById('tableContainer');
        if (container) {
            container.innerHTML = `<div class="notification is-danger"><strong>Waduh, Gagal Total!</strong><p>Gagal memuat data dasar (toko/produk/stok). Coba refresh halaman.<br>Error: ${error}</p></div>`;
        }
        console.error("Fatal Error:", error);
    }

    // --- DIRECT EXPORT FUNCTIONS ---
    function runDirectExport() {
        const statusText = document.getElementById('status-text');
        const statusProgress = document.getElementById('status-progress');
        const urlParams = new URLSearchParams(window.location.search);
        const storeCode = urlParams.get('store')?.toUpperCase();

        if (!storeCode) {
            statusText.textContent = 'Error: Parameter ?store=[kode_toko] tidak ada di URL.';
            statusProgress.remove();
            return;
        }

        statusText.textContent = `Memproses data untuk toko ${storeCode}...`;

        const storeStock = allStockData[storeCode];
        if (!storeStock) {
            statusText.textContent = `Error: Tidak ada data stok untuk toko ${storeCode} di file live_stock.json.`;
            statusProgress.remove();
            return;
        }

        const stockMap = new Map(storeStock.map(item => [item.kodeproduk, item.stock]));
        const exportProductList = allProducts.map(p => {
            const stock = stockMap.get(p.kodeproduk) || 0;
            return { code: p.kodeproduk, name: p.namaproduk, stock };
        });

        statusText.textContent = 'Sip, beres! Stoknya udah diproses.';
        statusProgress.value = 100;

        const header = 'kodeproduk,namaproduk,stok\n';
        const rows = exportProductList.map(p => `${p.code},${p.name.replace(/"/g, '''''')},${p.stock}`).join('\n');
        downloadFile(`stok_${storeCode}_${getFormattedDate()}.csv`, header + rows);
    }

    // --- INTERACTIVE PAGE FUNCTIONS ---
    function initializeInteractivePage() {
        const fetchButton = document.getElementById('fetchButton');
        const storeCodeInput = document.getElementById('storeCodeInput');
        const tableContainer = document.getElementById('tableContainer');
        const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
        const autocompleteResults = document.getElementById('autocomplete-results');
        const resultsHeader = document.getElementById('results-header');
        const exportCsvButton = document.getElementById('export-csv');
        const exportExcelButton = document.getElementById('export-excel');

        let selectedStoreInfo = { code: '', name: '' };
        let currentProductList = [];

        storeCodeInput.disabled = false;
        storeCodeInput.placeholder = "Ketik nama atau kode toko...";

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

        fetchButton.addEventListener('click', displayStockData);

        function displayStockData() {
            const storeCode = selectedStoreInfo.code?.toUpperCase() || storeCodeInput.value.trim().toUpperCase();
            if (!storeCode) {
                tableContainer.innerHTML = `<div class="notification is-warning is-light">Pilih dulu tokonya yang bener, bro.</div>`;
                return;
            }
            const foundStore = allStores.find(s => s.code.toUpperCase() === storeCode);
            selectedStoreInfo = foundStore ? foundStore : { code: storeCode, name: storeCode };

            tableContainer.innerHTML = '<div class="notification is-info is-light">Memproses data...</div>';
            resultsHeader.classList.add('is-hidden');

            const storeStock = allStockData[storeCode];
            if (!storeStock) {
                handleError({ message: `Tidak ada data stok untuk toko ${storeCode} di file live_stock.json.` });
                return;
            }

            const stockMap = new Map(storeStock.map(item => [item.kodeproduk, item.stock]));

            currentProductList = allProducts.map(p => ({
                code: p.kodeproduk,
                name: p.namaproduk,
                image: 'oos.png', // Placeholder image
                stock: stockMap.get(p.kodeproduk) || 0
            }));

            renderCards(currentProductList);
            resultsHeader.classList.remove('is-hidden');
        }

        function renderCards(products) {
            if (products.length === 0) {
                tableContainer.innerHTML = `<div class="notification is-warning">List produknya kosong nih.</div>`;
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
            const rows = currentProductList.map(p => `${p.code},${p.name.replace(/"/g, '''''')},${p.stock}`).join('\n');
            downloadFile(`stok_${selectedStoreInfo.code}_${getFormattedDate()}.csv`, header + rows);
        });

        exportExcelButton.addEventListener('click', () => {
            const headers = ['Kode Toko', 'Nama Toko', ...currentProductList.map(p => p.name.replace(/"/g, ''''''))];
            const values = [selectedStoreInfo.code, selectedStoreInfo.name, ...currentProductList.map(p => p.stock)];
            const csvContent = headers.join(',') + '\n' + values.join(',');
            downloadFile(`stok_excel_${selectedStoreInfo.code}_${getFormattedDate()}.csv`, csvContent);
        });
    }
});
