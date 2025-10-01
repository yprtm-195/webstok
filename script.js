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
            fetch(`https://api.myomv.cloud/api/stok/${storeCode}`).then(res => res.ok ? res.json() : [])
        ])
        .then(([productListText, apiData]) => {
            if (apiData.error) { // Handle error from our new API
                return Promise.reject(new Error(apiData.error));
            }

            const masterProductList = productListText.split('\n').slice(1).map(line => {
                const [kodeproduk, ...rest] = line.trim().split(',');
                return { kodeproduk, namaproduk: rest.join(',') };
            }).filter(p => p.kodeproduk);

            const apiDataMap = new Map(apiData.map(item => [item.kodeproduk, item]));
            const exportProductList = masterProductList.map(p => {
                const apiProduct = apiDataMap.get(p.kodeproduk);
                return { code: p.kodeproduk, name: apiProduct ? apiProduct.namaproduk : p.namaproduk, stock: apiProduct ? apiProduct.stok : 0 };
            });
            
            statusText.textContent = 'Sip, beres! Stoknya udah ditarik';
            statusProgress.value = 100;
            
            // Generate and download the standard CSV
            const header = 'kodeproduk,namaproduk,stok\n';
            const rows = exportProductList.map(p => `${p.code},${p.name.replace(/
