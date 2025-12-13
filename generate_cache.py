import requests
import json
import os
from datetime import datetime

# --- KONFIGURASI ---
# URL dari Apps Script yang membaca sheet "Stok Terkini" dan "Daftar Produk"
APPS_SCRIPT_CMS_URL = "https://script.google.com/macros/s/AKfycbxTNN-7FaYzql3TZza6dvPcQRFfizCsq_JAh3ZYrWL6amYkHUZO_RdomRJBslSBBHFQvg/exec"

# File-file output
OUTPUT_FILE = "live_stock.json"
STATUS_FILE = "update_status.json"

# --- FUNGSI-FUNGSI HELPER ---

def fetch_data_from_cms(url):
    """
    Mengambil data gabungan (pivot dan product map) dari Google Apps Script CMS.
    """
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
    except requests.exceptions.RequestException as e:
        print(f"Error saat mengambil data dari Apps Script: {e}")
        if e.response is not None:
            print(f"DEBUG: Status Code: {e.response.status_code}")
            print(f"DEBUG: Response Body: {e.response.text}")
        raise
    except Exception as e:
        print(f"Error memproses respons Apps Script: {e}")
        raise

# --- FUNGSI UTAMA ---

def main():
    print('Memulai proses pembuatan cache live_stock.json menggunakan Python...')

    try:
        # 1. Ambil data gabungan dari Apps Script CMS
        cms_data = fetch_data_from_cms(APPS_SCRIPT_CMS_URL)
        pivot_data = cms_data['pivotData']
        product_code_map = cms_data['productMap'] # Ini adalah object/dict, bukan Map

        if not pivot_data or len(pivot_data) <= 1:
            print("Tidak ada data pivot dari Apps Script CMS untuk diproses. Keluar.")
            return

        # 2. Transformasi data (un-pivot)
        print('Memulai transformasi data (un-pivot) ke format live_stock.json...')
        all_stock_data_transformed = {}
        
        headers = pivot_data[0]
        metadata_cols = ['Kode toko', 'Nama Toko', 'Cabang']
        product_name_headers = [h for h in headers if h not in metadata_cols]
        
        for row_idx in range(1, len(pivot_data)):
            row = pivot_data[row_idx]
            store_code = row[0]
            if not store_code:
                print(f"Peringatan: Baris {row_idx} tidak memiliki Kode toko, dilewati.")
                continue

            products_for_this_store = []
            
            for col_idx, header_name in enumerate(headers):
                if header_name in product_name_headers:
                    product_name = header_name
                    stock = row[col_idx]
                    kodeproduk = product_code_map.get(product_name, 'N/A') # Gunakan .get() untuk keamanan
                    
                    products_for_this_store.append({
                        "kodeproduk": kodeproduk,
                        "namaproduk": product_name,
                        "stock": int(stock) if str(stock).isdigit() else 0
                    })
            
            all_stock_data_transformed[store_code] = products_for_this_store

        print(f"Transformasi data selesai. Siap menyimpan data untuk {len(all_stock_data_transformed)} toko.")

        # 3. Tulis file live_stock.json
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(all_stock_data_transformed, f, indent=2, ensure_ascii=False)
        print(f"Berhasil generate {OUTPUT_FILE}.")

        # 4. Tulis file update_status.json
        update_status = {"lastUpdated": datetime.now().isoformat()}
        with open(STATUS_FILE, 'w', encoding='utf-8') as f:
            json.dump(update_status, f, indent=2, ensure_ascii=False)
        print(f"Berhasil generate {STATUS_FILE}.")

        print('\nProses pembuatan cache selesai dengan sukses!')

    except Exception as e:
        print(f"\nPROSES GAGAL: {e}")
        exit(1)

if __name__ == "__main__":
    main()