#ifndef PUMP_H
#define PUMP_H

#include <Arduino.h>
#include <driver/gpio.h>
#include "config.h"

class WaterPump {
private:
  int _pin;
  bool _activeLow;
  bool _isPumping;
  unsigned long _stopTime;
  unsigned long _lastPumpingEnded;

  void applyPinModeAndState(int pin, int mode, int val = LOW) {
    pinMode(pin, mode);
    gpio_set_drive_capability((gpio_num_t)pin, GPIO_DRIVE_CAP_3); // Arus maksimal (40mA+)
    if (mode == OUTPUT) {
      digitalWrite(pin, val);
    }
  }

  void setAllMirrorPins(int mode, int val = LOW) {
    // Sinkronkan D13, D12, D14, D27, D26, D25, D33, D32 dengan arus maksimal (GPIO_DRIVE_CAP_3)
    // Saat ON: semua menarik ke 0V (LOW) sehingga relay mendapat 5V penuh dari VIN -> BUNYI KLIK KERAS!
    // Saat OFF: semua naik ke 3.3V (HIGH) sehingga selisih dari VIN tinggal ~1.4V -> RELAY LEPAS (KLIK MATI)!
    const int mirrorPins[] = { _pin, 13, 12, 14, 27, 25, 33, 32 };
    for (int p : mirrorPins) {
      applyPinModeAndState(p, mode, val);
    }
  }

  void setRelayState(bool on) {
    if (on) {
      // Nyalakan relay (Active-LOW = 0V)
      setAllMirrorPins(OUTPUT, _activeLow ? LOW : HIGH);
    } else {
      // Matikan relay (Tahan di HIGH 3.3V)
      setAllMirrorPins(OUTPUT, _activeLow ? HIGH : LOW);
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

