import requests
import json
import os
from datetime import datetime

# --- KONFIGURASI ---
APPS_SCRIPT_CMS_URL = "https://script.google.com/macros/s/AKfycbxTNN-7FaYzql3TZza6dvPcQRFfizCsq_JAh3ZYrWL6amYkHUZO_RdomRJBslSBBHFQvg/exec"
OUTPUT_FILE = os.path.join("docs", "live_stock.json")
STATUS_FILE = os.path.join("docs", "update_status.json")
LIST_TOKO_FILE = os.path.join("docs", "listtoko.txt")

# --- FUNGSI-FUNGSI HELPER ---
def ensure_dir(directory):
    if not os.path.exists(directory):
        print(f"Membuat direktori output: {directory}")
        os.makedirs(directory)

def fetch_data_from_cms(url):
    print(f"Mengambil data dari Apps Script CMS: {url}")
    try:
        response = requests.get(url, timeout=30, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status() 
        json_response = response.json()
        
        if json_response.get("status") == "error":
            raise Exception(f"Apps Script mengembalikan error: {json_response.get('message', 'Unknown error')}")
        if not all(k in json_response for k in ['pivotData', 'productMap']):
             raise Exception("Format data dari Apps Script tidak sesuai. 'pivotData' atau 'productMap' tidak ditemukan.")
            
        print(f"Berhasil mengambil {len(json_response['pivotData']) - 1} baris data pivot dan {len(json_response['productMap'])} pemetaan produk.")
        return json_response
    except Exception as e:
        print(f"Error memproses respons Apps Script: {e}")
        raise

# --- FUNGSI UTAMA ---

def main():
    print('Memulai proses pembuatan cache live_stock.json menggunakan Python...')
    ensure_dir("docs")

    try:
        cms_data = fetch_data_from_cms(APPS_SCRIPT_CMS_URL)
        pivot_data = cms_data['pivotData']
        product_code_map = cms_data['productMap']

        if not pivot_data or len(pivot_data) <= 1:
            print("Tidak ada data pivot dari Apps Script CMS untuk diproses. Keluar.")
            return

        print('Memulai transformasi data (un-pivot) ke format live_stock.json dan pembuatan listtoko.txt...')
        all_stock_data_transformed = {}
        headers = pivot_data[0]
        metadata_cols = ['Kode toko', 'Nama Toko', 'Cabang']
        product_name_headers = [h for h in headers if h not in metadata_cols]
        unique_stores = set()
        
        for row_idx in range(1, len(pivot_data)):
            row = pivot_data[row_idx]
            store_code = row[0]
            store_name = row[1]
            
            if not store_code:
                print(f"Peringatan: Baris {row_idx} tidak memiliki Kode toko, dilewati.")
                continue

            unique_stores.add((store_code, store_name))
            products_for_this_store = []
            
            for col_idx, header_name in enumerate(headers):
                if header_name in product_name_headers:
                    product_name = header_name
                    stock = row[col_idx]
                    # NEW: Get array of codes, or default to ['N/A']
                    kodeproduk_array = product_code_map.get(product_name, ['N/A'])
                    
                    products_for_this_store.append({
                        "kodeproduk": kodeproduk_array, # This is now an array
                        "namaproduk": product_name,
                        "stock": int(stock) if str(stock).isdigit() else 0
                    })
            
            all_stock_data_transformed[store_code] = products_for_this_store

        print(f"Transformasi data selesai. Siap menyimpan data untuk {len(all_stock_data_transformed)} toko.")

        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(all_stock_data_transformed, f, indent=2, ensure_ascii=False)
        print(f"Berhasil generate {OUTPUT_FILE}.")

        update_status = {"lastUpdated": datetime.now().isoformat()}
        with open(STATUS_FILE, 'w', encoding='utf-8') as f:
            json.dump(update_status, f, indent=2, ensure_ascii=False)
        print(f"Berhasil generate {STATUS_FILE}.")

        with open(LIST_TOKO_FILE, 'w', encoding='utf-8') as f:
            f.write("kodetoko,namatoko\n")
            sorted_stores = sorted(list(unique_stores), key=lambda x: x[0])
            for code, name in sorted_stores:
                f.write(f"{code},{name}\n")
        print(f"Berhasil generate {LIST_TOKO_FILE} dengan {len(unique_stores)} toko.")

        print('\nProses pembuatan cache selesai dengan sukses!')

    except Exception as e:
        print(f"\nPROSES GAGAL: {e}")
        exit(1)

if __name__ == "__main__":
    main()
