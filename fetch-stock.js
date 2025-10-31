const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

// --- CONFIGURATION ---
const API_BASE_URL = 'https://retractile-asha-guiltlessly.ngrok-free.dev/api/stok/';
const TOKO_LIST_FILE = path.join(__dirname, 'listtoko.txt');
const PRODUK_LIST_FILE = path.join(__dirname, 'listproduk.txt');
const OUTPUT_FILE = path.join(__dirname, 'live_stock.json');
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

// --- HELPER FUNCTIONS ---

/**
 * Reads a file and returns its content as an array of non-empty lines.
 * @param {string} filePath - The path to the file.
 * @returns {Promise<string[]>}
 */
const readFileLines = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return data.split('\n').map(line => line.trim()).filter(Boolean);
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        throw new Error(`Could not read file: ${filePath}`);
    }
};

/**
 * Fetches data from the API with retry mechanism.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<any>}
 */
const fetchWithRetry = async (url) => {
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const response = await fetch(url, {
                headers: { 'ngrok-skip-browser-warning': 'true' }
            });
            if (response.ok) {
                return await response.json();
            }
            // If response is not ok but not a total network failure, don't retry
            console.error(`[Attempt ${i + 1}] API request for ${url} failed with status: ${response.status}`);
            if (response.status >= 400 && response.status < 500) {
                 return []; // Don't retry for client errors (4xx)
            }
        } catch (error) {
            console.error(`[Attempt ${i + 1}] Network error for ${url}:`, error.message);
        }
        // Wait before retrying
        if (i < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
    console.error(`All ${MAX_RETRIES} retries failed for ${url}.`);
    return []; // Return empty array after all retries fail
};


// --- MAIN LOGIC ---

const main = async () => {
    console.log('Starting stock fetching process...');

    // 1. Read store and product lists in parallel
    const [tokoLines, produkLines] = await Promise.all([
        readFileLines(TOKO_LIST_FILE),
        readFileLines(PRODUK_LIST_FILE)
    ]);

    const storeCodes = tokoLines.slice(1).map(line => line.split(',')[0]).filter(Boolean);
    const masterProductList = produkLines.slice(1).map(line => {
        const [kodeproduk, ...rest] = line.split(',');
        return { kodeproduk, namaproduk: rest.join(',') };
    }).filter(p => p.kodeproduk);

    if (storeCodes.length === 0) {
        console.error("No store codes found in listtoko.txt. Aborting.");
        return;
    }
    console.log(`Found ${storeCodes.length} stores and ${masterProductList.length} master products.`);

    // 2. Fetch stock for all stores in parallel batches
    const BATCH_SIZE = 10; // Number of concurrent requests
    const allStockData = {};
    let storesProcessed = 0;

    console.log(`Starting fetch with a batch size of ${BATCH_SIZE}...`);

    for (let i = 0; i < storeCodes.length; i += BATCH_SIZE) {
        const batch = storeCodes.slice(i, i + BATCH_SIZE);
        console.log(`--> Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} stores (${i + batch.length}/${storeCodes.length})`);

        const batchPromises = batch.map(async (storeCode, index) => {
            await new Promise(resolve => setTimeout(resolve, index * 1000));
            try {
                const apiUrl = `${API_BASE_URL}${storeCode}`;
                let apiData = await fetchWithRetry(apiUrl);

                if (!Array.isArray(apiData)) {
                    console.warn(`  -> [${storeCode}] Warning: API response was not an array. Treating as empty.`);
                    apiData = [];
                }

                const apiDataMap = new Map(apiData.map(item => [item.kodeproduk, item]));

                const finalProductList = masterProductList.map(masterProduct => {
                    const apiProduct = apiDataMap.get(masterProduct.kodeproduk);
                    return {
                        kodeproduk: masterProduct.kodeproduk,
                        namaproduk: apiProduct ? apiProduct.namaproduk : masterProduct.namaproduk,
                        stock: apiProduct ? apiProduct.stock : 0
                    };
                });

                return { storeCode, finalProductList };
            } catch (error) {
                console.error(`  -> [${storeCode}] Error processing store:`, error);
                return null; // Return null on error to avoid breaking Promise.all
            }
        });

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
            if (result) {
                allStockData[result.storeCode] = result.finalProductList;
                storesProcessed++;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 4. Write the aggregated data to the output file
    try {
        await fs.writeFile(OUTPUT_FILE, JSON.stringify(allStockData, null, 2));
        console.log(`\nSuccessfully generated live_stock.json with data for ${storesProcessed} stores.`);
    } catch (error) {
        console.error('Error writing final JSON file:', error);
    }

    console.log('Stock fetching process finished.');
};

main().catch(error => {
    console.error("An unexpected error occurred:", error);
    process.exit(1);
});
