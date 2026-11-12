/**
 * =========================================================================
 * ENZOPONIK - SOIL SENSOR ADC CALIBRATION TOOL
 * =========================================================================
 * Gunakan sketch ini untuk menemukan nilai kalibrasi ADC yang tepat:
 * 1. Angkat sensor di udara terbuka (Kering) -> Catat nilai ADC_DRY
 * 2. Celupkan sensor ke wadah air/larutan nutrisi (Basah) -> Catat nilai ADC_WET
 * 3. Masukkan kedua nilai tersebut ke file `config.h` di firmware utama!
 * =========================================================================
 */

#define PIN_SOIL_SENSOR 34

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(PIN_SOIL_SENSOR, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_SOIL_SENSOR, ADC_11db);

  Serial.println("\n========================================================");
  Serial.println("     🌱 ENZOPONIK SENSOR CALIBRATION TOOL 🌱            ");
  Serial.println("========================================================");
  Serial.println("Langkah Kalibrasi:");
  Serial.println("1. Biarkan sensor kering di udara terbuka.");
  Serial.println("   Lihat nilai ADC rata-rata -> ini adalah ADC_DRY (sekitar 3000-3400).");
  Serial.println("2. Celupkan sensor ke air/larutan nutrisi hingga batas garis putih.");
  Serial.println("   Lihat nilai ADC rata-rata -> ini adalah ADC_WET (sekitar 1300-1600).");
  Serial.println("3. Salin kedua nilai tersebut ke firmware/esp32_enzoponik/config.h !");
  Serial.println("========================================================\n");
}

void loop() {
  const int SAMPLES = 20;
  long sum = 0;
  int minVal = 4096;
  int maxVal = 0;

  for (int i = 0; i < SAMPLES; i++) {
    int val = analogRead(PIN_SOIL_SENSOR);
    sum += val;
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
    delay(20);
  }

  int avgVal = (int)(sum / SAMPLES);

  Serial.printf(">> ADC Rata-rata: %4d  |  Min: %4d  |  Max: %4d  |  Rentang Noise: %2d\n",
                avgVal, minVal, maxVal, maxVal - minVal);

  delay(1000);
}

