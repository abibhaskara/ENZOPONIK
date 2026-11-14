/**
 * =========================================================================
 * ENZOPONIK - SMART VERTICAL HYDROPONIC TOWER FIRMWARE
 * =========================================================================
 * Perangkat   : ESP32 DevKit V1 (30-pin / 38-pin)
 * Target Menara: ENZOPONIK-01
 * Arsitektur  : Non-blocking State Machine, 12-bit ADC Noise Filtering,
 *               Cloudflare Worker HTTPS Edge Gateway Telemetry.
 * =========================================================================
 */

#include "config.h"
#include "sensor.h"
#include "pump.h"
#include "ezpn_network.h"

// Inisialisasi Objek Hardware & Layanan
SoilSensor      sensor(PIN_SOIL_SENSOR, ADC_DRY_DEFAULT, ADC_WET_DEFAULT);
WaterPump       pump(PIN_PUMP_RELAY, RELAY_ACTIVE_LOW);
EzpnNetwork     network;

// Pelacak Waktu & Identitas Hardware
String        activeDeviceId      = "";
unsigned long lastTelemetryTime   = 0;
unsigned long lastHeartbeatTime   = 0;
unsigned long bootTimestamp       = 0;
bool          ledState            = false;

// Generator ID Perangkat Otomatis: ezpn-[3 angka][5 huruf] berbasis eFuse MAC unik ESP32
String generateAutoDeviceId() {
  uint64_t mac = ESP.getEfuseMac();
  // 3 digit angka (100 - 999)
  uint32_t numPart = 100 + (uint32_t)(mac % 900);

  // 5 huruf kecil unik
  const char charset[] = "abcdefghjkmnpqrstuvwxyz"; // 23 karakter tanpa i, l, o agar jelas terbaca
  char letterPart[6];
  uint64_t seed = (mac >> 10);
  for (int i = 0; i < 5; i++) {
    letterPart[i] = charset[seed % 23];
    seed = (seed / 23) ^ (mac >> (i * 3));
  }
  letterPart[5] = '\0';

  char buf[32];
  snprintf(buf, sizeof(buf), "ezpn-%03u%s", numPart, letterPart);
  return String(buf);
}

void printSystemBanner() {
  Serial.println("\n========================================================");
  Serial.println("         🌱 ENZOPONIK SMART TOWER FIRMWARE 🌱         ");
  Serial.println("========================================================");
  Serial.printf(" Device ID      : %s\n", activeDeviceId.c_str());
  Serial.printf(" Firmware Ver   : %s\n", FIRMWARE_VERSION);
  Serial.printf(" Soil Sensor Pin: GPIO %d (ADC1_CH6)\n", PIN_SOIL_SENSOR);
  Serial.printf(" Pump Relay Pin : GPIO %d (%s)\n", PIN_PUMP_RELAY, RELAY_ACTIVE_LOW ? "Active LOW" : "Active HIGH");
  Serial.printf(" Cloud Endpoint : %s\n", CLOUDFLARE_WORKER_URL);
  Serial.println("========================================================\n");
}

void handleSerialCommands() {
  if (Serial.available() > 0) {
    char cmd = (char)Serial.read();
    if (cmd == 'p' || cmd == 'P') {
      Serial.println("[MANUAL CMD] Menjalankan tes pompa 5 detik...");
      pump.start(5, true); // ignoreCooldown = true untuk tes manual
    } else if (cmd == 's' || cmd == 'S') {
      Serial.println("[MANUAL CMD] Mematikan pompa...");
      pump.stop();
    } else if (cmd == 'r' || cmd == 'R') {
      SoilReading r = sensor.read();
      Serial.printf("[MANUAL SENSOR] Kelembaban: %d%% | ADC Raw: %d\n", r.moisturePercent, r.rawAdc);
    } else if (cmd == 'i' || cmd == 'I') {
      uint64_t mac = ESP.getEfuseMac();
      Serial.printf("[INFO PERANGKAT] ID: %s | eFuse MAC: %04X%08X\n",
                    activeDeviceId.c_str(), (uint16_t)(mac >> 32), (uint32_t)mac);
    } else if (cmd == 'h' || cmd == 'H') {
      Serial.println("\n[MENU BANTUAN SERIAL]");
      Serial.println(" 'p' / 'P' : Tes nyalakan pompa 5 detik");
      Serial.println(" 's' / 'S' : Matikan pompa segera");
      Serial.println(" 'r' / 'R' : Baca sensor kelembaban saat ini");
      Serial.println(" 'i' / 'I' : Tampilkan ID perangkat & info chip");
      Serial.println(" 'h' / 'H' : Tampilkan bantuan ini\n");
    }
  }
}

void updateLedHeartbeat() {
  unsigned long now = millis();
  unsigned long interval = 1000;

  if (pump.isActive()) {
    interval = 100; // Berkedip sangat cepat jika pompa sedang menyiram
  } else if (!network.isConnected()) {
    interval = 500; // Berkedip sedang jika koneksi Wi-Fi putus
  } else {
    // Mode online normal: Nyala terus dengan kedip singkat tiap 2 detik
    interval = 2000;
  }

  if (now - lastHeartbeatTime >= interval) {
    lastHeartbeatTime = now;
    ledState = !ledState;
    digitalWrite(PIN_STATUS_LED, ledState ? HIGH : LOW);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000); // Waktu stabilisasi Serial

  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);

  // Inisialisasi ID Perangkat (Otomatis ezpn-[3 angka][5 huruf] atau custom)
  if (String(DEVICE_ID) == "AUTO" || String(DEVICE_ID).length() == 0) {
    activeDeviceId = generateAutoDeviceId();
  } else {
    activeDeviceId = String(DEVICE_ID);
  }

  printSystemBanner();

  // 1. Inisialisasi Relay Pompa Air & Self-Test Klik Fisik (3x Klik)
  Serial.println("[INIT] Menginisialisasi Relay Pompa Air & Uji Klik 3x...");
  pump.begin();
  for (int i = 1; i <= 3; i++) {
    Serial.printf("  -> [TES KLIK %d/3] RELAY ON  (KLIK!)\n", i);
    digitalWrite(PIN_STATUS_LED, HIGH);
    pump.start(2, true);
    delay(700);
    Serial.printf("  -> [TES KLIK %d/3] RELAY OFF (KLIK!)\n", i);
    digitalWrite(PIN_STATUS_LED, LOW);
    pump.stop();
    delay(700);
  }
  Serial.println("[INIT] Uji Relay Selesai [OK]");

  // 2. Inisialisasi Sensor Kelembaban Tanah (ADC 12-bit & Atenuasi)
  Serial.print("[INIT] Menginisialisasi Sensor Kapasitif...");
  sensor.begin();
  Serial.println(" [OK]");

  // 3. Hubungkan ke Wi-Fi
  network.connectWiFi();

  bootTimestamp = millis();
  lastTelemetryTime = millis() - TELEMETRY_INTERVAL_MS; // Segera kirim telemetri pertama

  Serial.println("[SYSTEM] Sistem siap beroperasi. Ketik 'h' di Serial Monitor untuk perintah manual.\n");
}

void loop() {
  // 1. Monitor pematian otomatis pompa air (wajib dipanggil tiap tick)
  pump.update();

  // 2. Cek koneksi Wi-Fi dan reconnect otomatis jika terputus
  network.checkAndReconnect();

  // 3. Indikator LED status
  updateLedHeartbeat();

  // 4. Periksa perintah manual dari Serial Monitor (p / s / r / h)
  handleSerialCommands();

  // 5. Siklus Telemetri Rutin ke Cloudflare Worker
  unsigned long currentMillis = millis();
  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;

    // Baca kelembaban tanah dengan filter noise multi-sample
    SoilReading reading = sensor.read();
    int uptime = (int)((currentMillis - bootTimestamp) / 1000);

    Serial.println("\n--------------------------------------------------------");
    Serial.printf("[TELEMETRI] Kelembaban: %d%% | ADC Raw: %d | Pompa: %s | Uptime: %ds\n",
                  reading.moisturePercent,
                  reading.rawAdc,
                  pump.isActive() ? "AKTIF" : "IDLE",
                  uptime);

    // Kirim payload JSON ke Cloudflare Worker via HTTPS
    CloudResponse response = network.sendTelemetry(
      activeDeviceId,
      reading.moisturePercent,
      reading.rawAdc,
      pump.isActive(),
      uptime
    );

    // Eksekusi instruksi kontrol jika diterima dari Cloudflare / Firebase
    if (response.success && response.shouldRunPump && !pump.isActive()) {
      Serial.printf("[KONTROL] Menerima perintah RUN_PUMP dari Cloud (%d detik).\n", response.pumpDurationSec);
      pump.start(response.pumpDurationSec, true);
    }
    Serial.println("--------------------------------------------------------");
  }
}

