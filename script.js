document.addEventListener('DOMContentLoaded', () => {

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
    // Check if we are on the direct export page or the interactive page
    const statusContainer = document.getElementById('status-container');

    if (statusContainer) {
        // --- DIRECT EXPORT PAGE LOGIC (direct.html) ---
        runDirectExport();
    } else {
        // --- INTERACTIVE PAGE LOGIC (index.html) ---
        initializeInteractivePage();
    }

    // --- DIRECT EXPORT FUNCTIONS ---
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
        statusProgress.removeAttribute('value'); // Indeterminate progress

        Promise.all([
            fetch('listproduk.txt').then(res => res.ok ? res.text() : Promise.reject(new Error('Gagal ngambil listproduk.txt'))),
            fetch(`https://stok.myomv.cloud/api/cart?store_code=${storeCode}`).then(res => res.ok ? res.json() : [])
        ])
        .then(([productListText, apiData]) => {
            const masterProductList = productListText.split('\n').slice(1).map(line => {
                const [kodeproduk, ...rest] = line.trim().split(',');
                return { kodeproduk, namaproduk: rest.join(',') };
            }).filter(p => p.kodeproduk);

            const apiDataMap = new Map(apiData.map(item => [item.productCode, item]));
            const exportProductList = masterProductList.map(p => {
                const apiProduct = apiDataMap.get(p.kodeproduk);
                return { code: p.kodeproduk, name: apiProduct ? apiProduct.productName : p.namaproduk, stock: apiProduct ? apiProduct.stock : 0 };
            });
            
            statusText.textContent = 'Sip, beres! Filenya lagi di-download...';
            statusProgress.value = 100;
            
            // Generate and download the standard CSV
            const header = 'kodeproduk,namaproduk,stok\n';
            const rows = exportProductList.map(p => `"${p.code}","${p.name.replace(/"/g, '')}",${p.stock}`).join('\n');
            downloadFile(`stok_${getFormattedDate()}.csv`, header + rows);
        })
        .catch(error => {
            statusText.innerHTML = `<strong>Waduh, Gagal!</strong><br>${error.message}`;
            statusProgress.remove();
        });
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

            Promise.all([
                fetch('listproduk.txt').then(res => res.ok ? res.text() : Promise.reject(new Error('Gagal ngambil listproduk.txt'))),
                fetch(`https://stok.myomv.cloud/api/cart?store_code=${storeCode}`).then(res => res.ok ? res.json() : [])
            ])
            .then(([productListText, apiData]) => {
                const masterProductList = productListText.split('\n').slice(1).map(line => {
                    const [kodeproduk, ...rest] = line.trim().split(',');
                    return { kodeproduk, namaproduk: rest.join(',') };
                }).filter(p => p.kodeproduk);

                const apiDataMap = new Map(apiData.map(item => [item.productCode, item]));
                currentProductList = masterProductList.map(p => {
                    const apiProduct = apiDataMap.get(p.kodeproduk);
                    return {
                        code: p.kodeproduk,
                        name: apiProduct ? apiProduct.productName : p.namaproduk,
                        image: apiProduct ? apiProduct.productImage : 'oos.png',
                        stock: apiProduct ? apiProduct.stock : 0
                    };
                });

                renderCards(currentProductList);
                resultsHeader.classList.remove('is-hidden');
            })
            .catch(handleError);
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
            const rows = currentProductList.map(p => `"${p.code}","${p.name.replace(/"/g, '')}",${p.stock}`).join('\n');
            downloadFile(`stok_${getFormattedDate()}.csv`, header + rows);
        });

        exportExcelButton.addEventListener('click', () => {
            const headers = ['Kode Toko', 'Nama Toko', ...currentProductList.map(p => p.name.replace(/"/g, ''))];
            const values = [selectedStoreInfo.code, selectedStoreInfo.name, ...currentProductList.map(p => p.stock)];
            const csvContent = headers.map(h => `"${h}"`).join(',') + '\n' + values.map(v => `"${v}"`).join(',');
            downloadFile(`stok_${getFormattedDate()}.csv`, csvContent);
        });
    }
});
