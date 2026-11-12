#ifndef PUMP_H
#define PUMP_H

#include <Arduino.h>
#include "config.h"

class WaterPump {
private:
  int _pin;
  bool _activeLow;
  bool _isPumping;
  unsigned long _stopTime;
  unsigned long _lastPumpingEnded;

  void setRelayState(bool on) {
    if (_activeLow) {
      digitalWrite(_pin, on ? LOW : HIGH);
    } else {
      digitalWrite(_pin, on ? HIGH : LOW);
    }
    _isPumping = on;
  }

public:
  WaterPump(int pin, bool activeLow = RELAY_ACTIVE_LOW)
    : _pin(pin), _activeLow(activeLow), _isPumping(false), _stopTime(0), _lastPumpingEnded(0) {}

  void begin() {
    pinMode(_pin, OUTPUT);
    // Pastikan pompa dalam keadaan MATI saat pertama kali dinyalakan
    setRelayState(false);
  }

  bool start(int durationSec, bool ignoreCooldown = false) {
    unsigned long now = millis();

    // 1. Cek jeda cooldown (kecuali diabaikan untuk tes manual)
    if (!ignoreCooldown && _lastPumpingEnded > 0) {
      unsigned long elapsedCooldown = (now - _lastPumpingEnded) / 1000;
      if (elapsedCooldown < PUMP_COOLDOWN_SEC) {
        Serial.printf("[PUMP] Ditolak: Masih dalam periode cooldown (%lu detik lagi)\n",
                      PUMP_COOLDOWN_SEC - elapsedCooldown);
        return false;
      }
    }

    // 2. Batasi durasi dengan batasan keamanan keras (maksimal 25 detik)
    if (durationSec <= 0) durationSec = 10;
    if (durationSec > MAX_PUMP_DURATION_SEC) {
      Serial.printf("[PUMP] Durasi diminta %ds dipotong ke batas aman: %ds\n",
                    durationSec, MAX_PUMP_DURATION_SEC);
      durationSec = MAX_PUMP_DURATION_SEC;
    }

    // 3. Nyalakan relay
    setRelayState(true);
    _stopTime = now + (unsigned long)(durationSec * 1000);
    Serial.printf("[PUMP] Pompa air DINYALAKAN selama %d detik.\n", durationSec);
    return true;
  }

  void stop() {
    if (_isPumping) {
      setRelayState(false);
      _lastPumpingEnded = millis();
      _stopTime = 0;
      Serial.println("[PUMP] Pompa air DIMATIKAN.");
    }
  }

  // Wajib dipanggil rutin di dalam loop() agar pematian otomatis bekerja tanpa delay
  void update() {
    if (_isPumping && millis() >= _stopTime) {
      stop();
    }
  }

  bool isActive() const {
    return _isPumping;
  }

  int remainingDurationSec() const {
    if (!_isPumping || millis() >= _stopTime) return 0;
    return (int)((_stopTime - millis()) / 1000);
  }
};

#endif // PUMP_H
