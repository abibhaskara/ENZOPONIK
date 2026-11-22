#include "config.h"
#include "sensor.h"
#include "pump.h"
#include "ezpn_network.h"

SoilSensor      sensor(PIN_SOIL_SENSOR, ADC_DRY_DEFAULT, ADC_WET_DEFAULT);
WaterPump       pump(PIN_PUMP_RELAY, RELAY_ACTIVE_LOW);
EzpnNetwork     network;

String        activeDeviceId      = "";
unsigned long lastTelemetryTime   = 0;
unsigned long lastHeartbeatTime   = 0;
unsigned long bootTimestamp       = 0;
bool          ledState            = false;

String generateAutoDeviceId() {
  uint64_t mac = ESP.getEfuseMac();

  uint32_t numPart = 100 + (uint32_t)(mac % 900);

  const char charset[] = "abcdefghjkmnpqrstuvwxyz";
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
      pump.start(5, true);
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
    interval = 100;
  } else if (!network.isConnected()) {
    interval = 500;
  } else {

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
  delay(1000);

  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);

  if (String(DEVICE_ID) == "AUTO" || String(DEVICE_ID).length() == 0) {
    activeDeviceId = generateAutoDeviceId();
  } else {
    activeDeviceId = String(DEVICE_ID);
  }

  printSystemBanner();

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

  Serial.print("[INIT] Menginisialisasi Sensor Kapasitif...");
  sensor.begin();
  Serial.println(" [OK]");

  network.connectWiFi();

  bootTimestamp = millis();
  lastTelemetryTime = millis() - TELEMETRY_INTERVAL_MS;

  Serial.println("[SYSTEM] Sistem siap beroperasi. Ketik 'h' di Serial Monitor untuk perintah manual.\n");
}

void loop() {

  pump.update();

  network.checkAndReconnect();

  updateLedHeartbeat();

  handleSerialCommands();

  unsigned long currentMillis = millis();
  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;

    SoilReading reading = sensor.read();
    int uptime = (int)((currentMillis - bootTimestamp) / 1000);

    Serial.println("\n--------------------------------------------------------");
    Serial.printf("[TELEMETRI] Kelembaban: %d%% | ADC Raw: %d | Pompa: %s | Uptime: %ds\n",
                  reading.moisturePercent,
                  reading.rawAdc,
                  pump.isActive() ? "AKTIF" : "IDLE",
                  uptime);

    CloudResponse response = network.sendTelemetry(
      activeDeviceId,
      reading.moisturePercent,
      reading.rawAdc,
      pump.isActive(),
      uptime
    );

    if (response.success) {
      if (response.shouldRunPump && !pump.isActive()) {
        Serial.printf("[KONTROL] Menerima perintah RUN_PUMP dari Cloud (%d detik).\n", response.pumpDurationSec);
        pump.start(response.pumpDurationSec, response.isManual);
      } else if (!response.shouldRunPump && pump.isActive()) {
        Serial.println("[KONTROL] Menerima perintah STOP_PUMP dari Cloud.");
        pump.stop();
      }
    }
    Serial.println("--------------------------------------------------------");
  }
}

