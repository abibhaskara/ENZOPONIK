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
    if (on) {
      pinMode(_pin, OUTPUT);
      digitalWrite(_pin, _activeLow ? LOW : HIGH);
    } else if (_activeLow) {
      // High-Z (INPUT) agar tidak ada arus bocor 5V ke ESD dioda 3.3V pada modul relay Active-LOW 5V
      pinMode(_pin, INPUT);
    } else {
      pinMode(_pin, OUTPUT);
      digitalWrite(_pin, LOW);
    }
    _isPumping = on;
  }

public:
  WaterPump(int pin, bool activeLow = RELAY_ACTIVE_LOW)
    : _pin(pin), _activeLow(activeLow), _isPumping(false), _stopTime(0), _lastPumpingEnded(0) {}

  void begin() {
    pinMode(_pin, OUTPUT);

    setRelayState(false);
  }

  bool start(int durationSec, bool ignoreCooldown = false) {
    unsigned long now = millis();

    if (!ignoreCooldown && _lastPumpingEnded > 0) {
      unsigned long elapsedCooldown = (now - _lastPumpingEnded) / 1000;
      if (elapsedCooldown < PUMP_COOLDOWN_SEC) {
        Serial.printf("[PUMP] Ditolak: Masih dalam periode cooldown (%lu detik lagi)\n",
                      PUMP_COOLDOWN_SEC - elapsedCooldown);
        return false;
      }
    }

    if (durationSec <= 0) durationSec = 10;
    if (durationSec > MAX_PUMP_DURATION_SEC) {
      Serial.printf("[PUMP] Durasi diminta %ds dipotong ke batas aman: %ds\n",
                    durationSec, MAX_PUMP_DURATION_SEC);
      durationSec = MAX_PUMP_DURATION_SEC;
    }

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

  void update() {
    if (_isPumping && (long)(millis() - _stopTime) >= 0) {
      stop();
    }
  }

  bool isActive() const {
    return _isPumping;
  }

  int remainingDurationSec() const {
    if (!_isPumping || (long)(millis() - _stopTime) >= 0) return 0;
    return (int)((_stopTime - millis()) / 1000);
  }
};

#endif

