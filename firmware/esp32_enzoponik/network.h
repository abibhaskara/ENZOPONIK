#ifndef NETWORK_H
#define NETWORK_H

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "config.h"

struct CloudResponse {
  bool success;
  bool shouldRunPump;
  int pumpDurationSec;
  String command;
};

class NetworkManager {
private:
  unsigned long _lastWifiCheck;

public:
  NetworkManager() : _lastWifiCheck(0) {}

  void connectWiFi() {
    Serial.println();
    Serial.print("[WiFi] Menghubungkan ke: ");
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    unsigned long startAttempt = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < WIFI_CONNECT_TIMEOUT) {
      delay(500);
      Serial.print(".");
      // Berkedip cepat pada LED saat mencari Wi-Fi
      digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED));
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("[WiFi] Sukses terhubung! IP ESP32: ");
      Serial.println(WiFi.localIP());
      Serial.printf("[WiFi] Kekuatan Sinyal (RSSI): %d dBm\n", WiFi.RSSI());
      digitalWrite(PIN_STATUS_LED, HIGH); // LED solid menyala saat online
    } else {
      Serial.println("[WiFi] GAGAL terhubung. Masuk ke mode offline darurat.");
      digitalWrite(PIN_STATUS_LED, LOW);
    }
  }

  bool isConnected() {
    return WiFi.status() == WL_CONNECTED;
  }

  void checkAndReconnect() {
    if (millis() - _lastWifiCheck > 10000) { // Cek tiap 10 detik
      _lastWifiCheck = millis();
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WiFi] Koneksi terputus! Mencoba menghubungkan kembali...");
        WiFi.disconnect();
        WiFi.reconnect();
      }
    }
  }

  // Mengirim pembacaan sensor ke Cloudflare Worker dan menerima instruksi pompa
  CloudResponse sendTelemetry(const String& deviceId, int soilMoisture, int rawAdc, bool pumpActive, int uptimeSec) {
    CloudResponse res;
    res.success = false;
    res.shouldRunPump = false;
    res.pumpDurationSec = 0;
    res.command = "NONE";

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[HTTP] Dibatalkan: Wi-Fi tidak terhubung.");
      return res;
    }

    WiFiClientSecure client;
    // Mengizinkan koneksi TLS aman ke Cloudflare Edge tanpa perlu inject root certificate manual
    client.setInsecure();

    HTTPClient https;
    if (!https.begin(client, CLOUDFLARE_WORKER_URL)) {
      Serial.println("[HTTP] Gagal menginisialisasi client HTTPS.");
      return res;
    }

    https.addHeader("Content-Type", "application/json");
    https.setTimeout(6000); // Batas waktu tunggu respons 6 detik

    // Susun JSON string secara ringkas & efisien
    String jsonPayload = "{";
    jsonPayload += "\"deviceId\":\"" + deviceId + "\",";
    jsonPayload += "\"soilMoisture\":" + String(soilMoisture) + ",";
    jsonPayload += "\"rawAdc\":" + String(rawAdc) + ",";
    jsonPayload += "\"pumpActive\":" + String(pumpActive ? "true" : "false") + ",";
    jsonPayload += "\"firmwareVersion\":\"" + String(FIRMWARE_VERSION) + "\",";
    jsonPayload += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    jsonPayload += "\"uptimeSec\":" + String(uptimeSec);
    jsonPayload += "}";

    unsigned long reqStart = millis();
    int httpCode = https.POST(jsonPayload);
    unsigned long latency = millis() - reqStart;

    if (httpCode == HTTP_CODE_OK || httpCode == 201) {
      String responseBody = https.getString();
      Serial.printf("[HTTP 200] Cloudflare merespons (%lums):\n", latency);
      Serial.println(responseBody);

      res.success = true;

      // Parsing respons ringan tanpa ketergantungan library eksternal
      if (responseBody.indexOf("\"command\":\"RUN_PUMP\"") > 0 ||
          responseBody.indexOf("\"pumpActive\":true") > 0) {
        res.shouldRunPump = true;
        res.command = "RUN_PUMP";

        // Ekstrak durasi pompa (contoh: "pumpDurationSec":15)
        int durIdx = responseBody.indexOf("\"pumpDurationSec\":");
        if (durIdx > 0) {
          int startIdx = durIdx + 18;
          int endIdx = responseBody.indexOf(",", startIdx);
          if (endIdx < 0) endIdx = responseBody.indexOf("}", startIdx);
          if (endIdx > startIdx) {
            res.pumpDurationSec = responseBody.substring(startIdx, endIdx).toInt();
          }
        }
        if (res.pumpDurationSec <= 0) res.pumpDurationSec = 15;
      } else {
        res.shouldRunPump = false;
        res.command = "STOP_PUMP";
      }
    } else {
      Serial.printf("[HTTP ERROR] Kode: %d | Latency: %lums\n", httpCode, latency);
    }

    https.end();
    return res;
  }
};

#endif // NETWORK_H

