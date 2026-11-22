#ifndef SENSOR_H
#define SENSOR_H

#include <Arduino.h>
#include "config.h"

struct SoilReading {
  int rawAdc;
  int moisturePercent;
};

class SoilSensor {
private:
  int _pin;
  int _adcDry;
  int _adcWet;

public:
  SoilSensor(int pin, int adcDry = ADC_DRY_DEFAULT, int adcWet = ADC_WET_DEFAULT)
    : _pin(pin), _adcDry(adcDry), _adcWet(adcWet) {}

  void begin() {
    pinMode(_pin, INPUT);

    analogReadResolution(12);
    analogSetPinAttenuation(_pin, ADC_11db);
  }

  void updateCalibration(int dry, int wet) {
    if (dry > wet) {
      _adcDry = dry;
      _adcWet = wet;
    }
  }

  SoilReading read() {
    const int SAMPLES = 16;
    int rawSamples[SAMPLES];

    for (int i = 0; i < SAMPLES; i++) {
      rawSamples[i] = analogRead(_pin);
      delay(5);
    }

    for (int i = 0; i < SAMPLES - 1; i++) {
      for (int j = 0; j < SAMPLES - i - 1; j++) {
        if (rawSamples[j] > rawSamples[j + 1]) {
          int temp = rawSamples[j];
          rawSamples[j] = rawSamples[j + 1];
          rawSamples[j + 1] = temp;
        }
      }
    }

    long sum = 0;
    int validCount = 0;
    for (int i = 3; i < SAMPLES - 3; i++) {
      sum += rawSamples[i];
      validCount++;
    }

    int filteredAdc = (validCount > 0) ? (int)(sum / validCount) : rawSamples[SAMPLES / 2];

    int moisture = 0;
    if (_adcDry > _adcWet) {
      float ratio = (float)(_adcDry - filteredAdc) / (float)(_adcDry - _adcWet);
      moisture = (int)(ratio * 100.0f);
    }

    moisture = constrain(moisture, 0, 100);

    SoilReading result;
    result.rawAdc = filteredAdc;
    result.moisturePercent = moisture;
    return result;
  }
};

#endif

