#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

#define DEVICE_ID             "ezpn-396qqvmz"
#define FIRMWARE_VERSION      "1.0.0"

#define CLOUDFLARE_WORKER_URL "https://enzoponik-worker.abibhaskaramulya.workers.dev/api/telemetry"

#define WIFI_SSID             "YOUR_WIFI_SSID"
#define WIFI_PASSWORD         "YOUR_WIFI_PASSWORD"
#define WIFI_CONNECT_TIMEOUT  25000

#define PIN_SOIL_SENSOR       34

#define PIN_PUMP_RELAY        26

#define PIN_STATUS_LED        2

#define RELAY_ACTIVE_LOW      true

#define MAX_PUMP_DURATION_SEC 25

#define PUMP_COOLDOWN_SEC     120

#define TELEMETRY_INTERVAL_MS 5000

#define ADC_DRY_DEFAULT       3200
#define ADC_WET_DEFAULT       1450

#endif
