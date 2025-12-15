function doGet(e) {
  const SPREADSHEET_ID = "10HlR0rRseB1TasNfKmMqkqq7A51D50Pci6eFVF63F74";
  const SHEET_NAME_PIVOT = "Stok Terkini";
  const SHEET_NAME_PRODUCTS = "Daftar Produk";
  
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // --- Ambil Data Stok Terkini (Pivot) ---
    const pivotSheet = ss.getSheetByName(SHEET_NAME_PIVOT);
    if (!pivotSheet) {
      throw new Error(`Sheet dengan nama '${SHEET_NAME_PIVOT}' tidak ditemukan.`);
    }
    const pivotData = pivotSheet.getDataRange().getValues();
    
    // --- Ambil Data Pemetaan Produk (ID dan Nama) ---
    const productSheet = ss.getSheetByName(SHEET_NAME_PRODUCTS);
    if (!productSheet) {
      throw new Error(`Sheet dengan nama '${SHEET_NAME_PRODUCTS}' tidak ditemukan.`);
    }
    const productMappingData = productSheet.getDataRange().getValues();
    
    // NEW: Handle multiple codes for the same name
    let productMap = {};
    if (productMappingData.length > 1) {
        productMappingData.slice(1).forEach(row => {
            const productId = row[0]; // Kolom A: product_id
            const productName = row[1]; // Kolom B: product_name
            if (productName && productId) {
                if (!productMap[productName]) {
                    productMap[productName] = []; // Initialize as an array
                }
                productMap[productName].push(productId); // Add the code to the array
            }
        });
    }

    // --- Gabungkan semua data dalam satu JSON ---
    const output = {
      pivotData: pivotData,
      productMap: productMap
    };
    
    return ContentService.createTextOutput(JSON.stringify(output))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    const errorOutput = {
      status: "error",
      message: err.message
    };
    return ContentService.createTextOutput(JSON.stringify(errorOutput))
      .setMimeType(ContentService.MimeType.JSON);
  }
}