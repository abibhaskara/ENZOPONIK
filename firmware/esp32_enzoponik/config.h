#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// =========================================================================
// 1. IDENTITAS PERANGKAT & CLOUD GATEWAY
// =========================================================================
// Set ke "AUTO" agar ESP32 otomatis men-generate ID berbasis eFuse MAC hardware:
// Format standar: ezpn-[3 angka][5 huruf] (Contoh: ezpn-742kxmpt)
// Atau tetapkan ID manual statis, contoh: "ezpn-591abcde"
#define DEVICE_ID             "AUTO"
#define FIRMWARE_VERSION      "1.0.0"

// Endpoint Cloudflare Worker yang telah aktif & live
#define CLOUDFLARE_WORKER_URL "https://enzoponik-worker.abibhaskaramulya.workers.dev/api/telemetry"

// =========================================================================
// 2. KREDENSIAL WI-FI (Ganti dengan nama & password Wi-Fi Anda)
// =========================================================================
#define WIFI_SSID             "NAMA_WIFI_ANDA"
#define WIFI_PASSWORD         "PASSWORD_WIFI_ANDA"
#define WIFI_CONNECT_TIMEOUT  25000 // 25 detik batas tunggu koneksi Wi-Fi

// =========================================================================
// 3. ALOKASI PINOUT FISIK ESP32 (Paling Aman & Stabil)
// =========================================================================
// Sensor Kapasitif Kelembaban Tanah (AOUT) -> Pin ADC1 (Bebas bentrok Wi-Fi)
#define PIN_SOIL_SENSOR       34

// Relay Pompa Air (IN) -> General Output aman (Tanpa glitch saat booting)
#define PIN_PUMP_RELAY        26

// LED Indikator Status Board (LED biru bawaan ESP32 DevKit)
#define PIN_STATUS_LED        2

// =========================================================================
// 4. KARAKTERISTIK MODUL RELAY
// =========================================================================
// Sebagian besar (95%) modul relay 1-channel adalah "Active LOW" (relay nyala saat pin LOW/0V).
// Jika saat dinyalakan pompa langsung menyala padahal belum disuruh, ubah nilai ini menjadi 'false'.
#define RELAY_ACTIVE_LOW      true

// =========================================================================
// 5. BATASAN KEAMANAN FISIK MENARA (SAFETY GUARDS)
// =========================================================================
// Batas maksimum keras pompa boleh menyala terus-menerus (mencegah banjir / pompa panas)
#define MAX_PUMP_DURATION_SEC 25

// Interval jeda wajib setelah menyiram sebelum pompa boleh dinyalakan lagi (2 menit)
#define PUMP_COOLDOWN_SEC     120

// Interval rutin pengiriman data sensor ke cloud (15 detik)
#define TELEMETRY_INTERVAL_MS 15000

// =========================================================================
// 6. NILAI KALIBRASI DEFAULT SENSOR TANAH (ADC)
// =========================================================================
// ADC_DRY: Nilai saat sensor kering di udara terbuka (0% kelembaban)
// ADC_WET: Nilai saat sensor terendam air/larutan nutrisi (100% kelembaban)
#define ADC_DRY_DEFAULT       3200
#define ADC_WET_DEFAULT       1450

#endif // CONFIG_H
