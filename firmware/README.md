# 🌿 Panduan Firmware & Pengkabelan Fisik Menara ENZOPONIK (ESP32)

Dokumentasi resmi untuk perakitan sirkuit elektronik, kalibrasi sensor kapasitif, pengaturan relay pompa air, dan flashing firmware microchip **ESP32 DevKit** untuk menara hidroponik vertikal **ENZOPONIK**.

---

## 📋 Daftar Isi
1. [Daftar Komponen Hardware](#1-daftar-komponen-hardware)
2. [Skema Pengkabelan Fisik (Wiring Matrix)](#2-skema-pengkabelan-fisik-wiring-matrix)
3. [Penjelasan Polarity Relay (Active LOW vs Active HIGH)](#3-penjelasan-polarity-relay)
4. [Instalasi & Pengaturan Arduino IDE](#4-instalasi--pengaturan-arduino-ide)
5. [Konfigurasi Wi-Fi & Device ID](#5-konfigurasi-wi-fi--device-id)
6. [Flashing Firmware ke ESP32](#6-flashing-firmware-ke-esp32)
7. [Panduan Kalibrasi ADC Sensor Tanah](#7-panduan-kalibrasi-adc-sensor-tanah)
8. [Stiker Fisik QR Code Menara](#8-stiker-fisik-qr-code-menara)
9. [Troubleshooting & FAQ](#9-troubleshooting--faq)

---

## 1. Daftar Komponen Hardware

| Komponen | Spesifikasi / Model | Fungsi |
| :--- | :--- | :--- |
| **Microcontroller** | ESP32 DevKit V1 (30-pin atau 38-pin, Wi-Fi 2.4GHz) | Otak utama menara & gateway IoT ke Cloudflare |
| **Sensor Kelembaban** | Capacitive Soil Moisture Sensor v1.2 / v2.0 (Anti-korosi) | Mengukur kelembaban media tanam (Rockwool/Cocopeat) |
| **Modul Relay** | 1-Channel Relay Module 5V dengan Optocoupler | Saklar elektrik pengontrol pompa air otomatis |
| **Pompa Air** | Pompa Submersible Mini DC 5V - 12V | Sirkulasi larutan nutrisi ke puncak menara |
| **Power Supply** | Adaptor DC 5V/2A atau 12V (tergantung tegangan pompa) | Sumber daya sistem |
| **Kabel Jumper** | Jumper wire Female-to-Female & Male-to-Female | Penghubung pin antar modul |

---

## 2. Skema Pengkabelan Fisik (Wiring Matrix)

### A. Tabel Sambungan Pin

| Modul Sensor / Aktuator | Pin Modul | Sambungkan ke Pin ESP32 / Power | Catatan Khusus |
| :--- | :--- | :--- | :--- |
| **Sensor Kapasitif** | **VCC** | **3V3** (ESP32) | Disarankan **3.3V** agar output ADC tidak melebihi batas aman ESP32 |
| | **GND** | **GND** (ESP32) | Ground bersama |
| | **AOUT** | **GPIO 34** | Jalur ADC1_CH6 (bebas bentrok dengan modul Wi-Fi) |
| **Modul Relay 1-Ch** | **VCC** | **VIN** (5V) | Daya koil relay memerlukan 5V stabil |
| | **GND** | **GND** (ESP32) | Ground bersama |
| | **IN** | **GPIO 26** | Pin sinyal pemicu (Clean GPIO, tanpa floating spike saat boot) |
| **Indikator Board** | **LED Built-in**| **GPIO 2** | Indikator visual status Wi-Fi, Cloud, dan Pompa |

### B. Sambungan Jalur Daya Pompa Air (Sisi Terminal Relay)

> [!CAUTION]
> **JANGAN PERNAH** mengambil daya positif (+) motor pompa air langsung dari pin 3.3V atau 5V mikrokontroler ESP32! Arus induktif motor pompa saat menyala dapat mereset ESP32 (*Brownout*) atau merusak regulator tegangan. Gunakan skema **Common Ground** berikut:

```
[ Power Adaptor (+) ] ───> [ Terminal Relay COM ]
[ Terminal Relay NO  ] ───> [ Kabel Merah (+) Pompa Air ]
[ Kabel Hitam (-) Pompa ] ───> [ Power Adaptor (-) ] ───> [ Pin GND ESP32 ] (Common Ground)
```

---

## 3. Penjelasan Polarity Relay

Mayoritas modul relay 1-channel yang beredar di pasaran bertipe **Active LOW**:
- Sinyal **LOW (0V)** $\rightarrow$ Relay Menutup (Pompa **MENYALA**).
- Sinyal **HIGH (3.3V)** $\rightarrow$ Relay Membuka (Pompa **MATI**).

Firmware ENZOPONIK secara default telah diatur ke **Active LOW** (`#define RELAY_ACTIVE_LOW true`).

### Cara Mengetes:
1. Hubungkan ESP32 ke komputer melalui USB.
2. Jika saat pertama kali dicolokkan pompa langsung **MENYALA** padahal belum diperintah menyiram:
   - Buka file [`firmware/esp32_enzoponik/config.h`](config.h).
   - Ubah baris:
     ```cpp
     #define RELAY_ACTIVE_LOW true
     ```
     Menjadi:
     ```cpp
     #define RELAY_ACTIVE_LOW false
     ```
   - Flash ulang ke ESP32.

---

## 4. Instalasi & Pengaturan Arduino IDE

1. Unduh dan buka **Arduino IDE** (versi 2.x ke atas direkomendasikan).
2. Tambahkan URL Board ESP32:
   - Buka menu: `File` $\rightarrow$ `Preferences` (atau `Settings` di macOS).
   - Di kolom **Additional Boards Manager URLs**, tempelkan tautan berikut:
     ```text
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Klik **OK**.
3. Buka menu: `Tools` $\rightarrow$ `Board` $\rightarrow$ `Boards Manager...`
   - Cari: `esp32` oleh *Espressif Systems*.
   - Klik **Install**.
4. Pilih Board & Port:
   - Menu: `Tools` $\rightarrow$ `Board` $\rightarrow$ `esp32` $\rightarrow$ Pilih **ESP32 Dev Module** (atau **DOIT ESP32 DEVKIT V1**).
   - Menu: `Tools` $\rightarrow$ `Port` $\rightarrow$ Pilih port USB ESP32 Anda (misal `COM3`, `COM4` di Windows, atau `/dev/cu.usbserial-...` di macOS).
   - Atur **Upload Speed**: `921600` (atau `115200` jika terjadi gagal upload).

> [!NOTE]
> Firmware ini dibangun secara **murni dan efisien** menggunakan pustaka bawaan core ESP32 (`WiFi.h`, `WiFiClientSecure.h`, `HTTPClient.h`), sehingga Anda **TIDAK PERLU mengunduh library pihak ketiga tambahan** dari Library Manager.

---

## 5. Konfigurasi Wi-Fi & Device ID

Buka file [`firmware/esp32_enzoponik/config.h`](config.h) pada Arduino IDE, lalu sesuaikan bagian berikut:

```cpp
// 1. Identitas Menara
#define DEVICE_ID             "ENZOPONIK-01"

// 2. Kredensial Wi-Fi
#define WIFI_SSID             "NAMA_WIFI_RUMAH_ANDA"
#define WIFI_PASSWORD         "PASSWORD_WIFI_ANDA"

// 3. Endpoint Cloudflare Edge Gateway (Sudah terpasang default)
#define CLOUDFLARE_WORKER_URL "https://enzoponik-worker.abibhaskaramulya.workers.dev/api/telemetry"
```

---

## 6. Flashing Firmware ke ESP32

1. Buka file utama: [`firmware/esp32_enzoponik/esp32_enzoponik.ino`](esp32_enzoponik/esp32_enzoponik.ino).
2. Klik tombol **Verify** (ikon centang) untuk memastikan kode berhasil dikompilasi tanpa error.
3. Klik tombol **Upload** (ikon panah ke kanan).
   *(Jika upload terhenti di tulisan `Connecting........_____.....`, tekan dan tahan tombol **BOOT** pada board ESP32 selama 2 detik lalu lepaskan)*.
4. Setelah upload selesai (`Leaving... Hard resetting via RTS pin...`), buka **Serial Monitor** di Arduino IDE (`Tools` $\rightarrow$ `Serial Monitor`).
5. Atur Baudrate ke **115200 baud**.
6. Anda akan melihat log sistem:
   ```text
   ========================================================
            🌱 ENZOPONIK SMART TOWER FIRMWARE 🌱         
   ========================================================
    Device ID      : ENZOPONIK-01
    Firmware Ver   : 1.0.0
    Soil Sensor Pin: GPIO 34 (ADC1_CH6)
    Pump Relay Pin : GPIO 26 (Active LOW)
    Cloud Endpoint : https://enzoponik-worker.abibhaskaramulya.workers.dev/api/telemetry
   ========================================================
   [INIT] Menginisialisasi Relay Pompa Air... [OK]
   [INIT] Menginisialisasi Sensor Kapasitif... [OK]
   [WiFi] Menghubungkan ke: NAMA_WIFI_RUMAH_ANDA
   .....
   [WiFi] Sukses terhubung! IP ESP32: 192.168.1.15
   [TELEMETRI] Kelembaban: 78% | ADC Raw: 1820 | Pompa: IDLE | Uptime: 2s
   [HTTP 200] Cloudflare merespons (312ms):
   {"success":true,"deviceId":"ENZOPONIK-01","receivedAt":"..."}
   ```

### Fitur Perintah Manual via Serial Monitor:
Sambil membuka Serial Monitor, Anda dapat mengetikkan huruf berikut lalu tekan Enter:
- Ketik `p` : Tes menyalakan pompa air selama 5 detik.
- Ketik `s` : Mematikan pompa air darurat.
- Ketik `r` : Mengambil pembacaan sensor kelembaban saat ini.
- Ketik `h` : Menampilkan menu bantuan.

---

## 7. Panduan Kalibrasi ADC Sensor Tanah

Karakteristik sensor kapasitif berbeda-beda tergantung batch produksi pabrik dan jenis media tanam (Rockwool vs Cocopeat). Untuk mendapatkan pembacaan $0\% - 100\%$ yang presisi:

1. Buka sketch: [`firmware/esp32_enzoponik/calibration_tool/calibration_tool.ino`](calibration_tool/calibration_tool.ino).
2. Upload sketch tersebut ke ESP32 dan buka Serial Monitor (115200 baud).
3. **Ukur Nilai Kering (0% Kelembaban):**
   - Biarkan bilah sensor kering di udara terbuka.
   - Perhatikan angka ADC yang muncul di Serial Monitor (biasanya berkisar antara `3000` s.d. `3400`).
   - Catat angka ini sebagai `ADC_DRY`.
4. **Ukur Nilai Basah (100% Kelembaban):**
   - Siapkan wadah berisi air atau larutan nutrisi AB Mix.
   - Celupkan bilah sensor ke dalam air sampai batas garis putih horizontal (jangan sampai komponen elektronik atas terendam air!).
   - Perhatikan angka ADC di Serial Monitor (biasanya berkisar antara `1300` s.d. `1600`).
   - Catat angka ini sebagai `ADC_WET`.
5. Buka kembali file [`firmware/esp32_enzoponik/config.h`](config.h) dan masukkan nilai hasil ukur Anda:
   ```cpp
   #define ADC_DRY_DEFAULT       3250  // Masukkan nilai kering Anda
   #define ADC_WET_DEFAULT       1420  // Masukkan nilai basah Anda
   ```
6. Flash kembali firmware utama [`esp32_enzoponik.ino`](esp32_enzoponik/esp32_enzoponik.ino).

---

## 8. Stiker Fisik QR Code Menara

Aplikasi web ENZOPONIK memiliki pemindai kamera bawaan (*QR Scanner*) untuk klaim kepemilikan menara secara otomatis.

Kami telah menyediakan file template stiker siap cetak:
👉 Buka file [`firmware/qr_sticker_generator.html`](qr_sticker_generator.html) di browser Google Chrome / Safari.
- Tampilan stiker berstandar industri 40mm x 40mm.
- Memuat logo ENZOPONIK, ID Perangkat (`ENZOPONIK-01`), QR code beresolusi tinggi, dan garis panduan gunting.
- Tekan **Ctrl + P** (atau **Cmd + P**) $\rightarrow$ Simpan sebagai PDF atau langsung cetak ke kertas stiker / vinyl tahan air (waterproof).

---

## 9. Troubleshooting & FAQ

### 1. Pompa menyala terus-menerus tanpa berhenti
- **Penyebab:** Polaritas relay terbalik.
- **Solusi:** Buka [`config.h`](config.h), ubah `RELAY_ACTIVE_LOW` dari `true` ke `false`.

### 2. Wi-Fi gagal terhubung (`[WiFi] GAGAL terhubung`)
- **Penyebab:** Frekuensi Wi-Fi 5GHz. ESP32 hanya mendukung frekuensi **2.4GHz**.
- **Solusi:** Pastikan router Wi-Fi Anda memancarkan SSID 2.4GHz atau gunakan fitur Personal Hotspot HP dengan opsi *Maximize Compatibility* aktif.

### 3. Nilai sensor selalu 0% atau 100%
- **Penyebab:** Kabel AOUT longgar atau terpasang ke pin yang salah.
- **Solusi:** Pastikan kabel AOUT sensor terpasang kokoh di **GPIO 34**. Jangan gunakan pin ADC2 (GPIO 0, 2, 4, 12, 13, 14, 15, 25, 26, 27) untuk sensor analog saat Wi-Fi menyala.

### 4. ESP32 restart sendiri saat pompa mulai berputar (Brownout Detector triggered)
- **Penyebab:** Lonjakan arus motor pompa menarik daya dari regulator ESP32 sehingga tegangan drop di bawah 2.7V.
- **Solusi:** Pisahkan sumber daya pompa menggunakan adaptor DC eksternal, dan hubungkan hanya kabel Ground-nya ke pin GND ESP32 (*Common Ground*).
