#!/usr/bin/env node
/**
 * ENZOPONIK - End-to-End Real-Time IoT Simulator
 *
 * Mensimulasikan perangkat fisik ESP32 yang mengirimkan pembacaan
 * Sensor Kapasitif Kelembaban Tanah ke Cloudflare Worker Edge Gateway.
 *
 * Alur End-to-End:
 * [ESP32 Simulator] -> HTTP POST -> [Cloudflare Worker] -> [Firestore DB] -> Realtime Push -> [Cloudflare Pages Web UI]
 *
 * Cara menjalankan:
 *   npm run simulate
 */

const WORKER_URL = process.env.VITE_API_BASE_URL
  ? `${process.env.VITE_API_BASE_URL}/api/telemetry`
  : 'https://enzoponik-worker.abibhaskaramulya.workers.dev/api/telemetry';

const DEVICE_ID = process.env.VITE_DEFAULT_DEVICE_ID || 'ENZOPONIK-01';

console.log('='.repeat(65));
console.log('🌱 ENZOPONIK - SIMULATOR IOT END-TO-END (ESP32 -> CLOUDFLARE WORKER)');
console.log(`🌐 Target Worker : ${WORKER_URL}`);
console.log(`📱 Hardware ID   : ${DEVICE_ID}`);
console.log(`💻 Web Dashboard : https://enzoponik.pages.dev`);
console.log('='.repeat(65));
console.log('Tekan Ctrl+C untuk menghentikan simulasi.\n');

// State simulasi
let soilMoisture = 68; // Persentase kelembaban awal
let pumpActive = false;
let cycle = 0;

async function sendTelemetry() {
  cycle++;

  // Logika simulasi dinamika air:
  if (pumpActive) {
    // Pompa aktif menyiram -> air naik cepat (+5% s.d. +9%)
    soilMoisture += Math.floor(Math.random() * 5) + 5;
    if (soilMoisture >= 82) {
      pumpActive = false;
      console.log('💧 [PUMP] Target kelembaban 80%+ tercapai. Pompa air dimatikan.');
    }
  } else {
    // Pompa mati -> air diserap tanaman & menguap (-0.5% s.d. -2%)
    soilMoisture -= (Math.random() * 1.5 + 0.5);
    if (soilMoisture <= 50) {
      pumpActive = true;
      console.log('⚠️ [ALERT] Kelembaban tanah <= 50% (kering)! Pompa air otomatis dinyalakan.');
    }
  }

  // Batasi rentang nilai realistis (25% - 95%)
  soilMoisture = Math.max(25, Math.min(95, parseFloat(soilMoisture.toFixed(1))));

  const payload = {
    deviceId: DEVICE_ID,
    soilMoisture: Math.round(soilMoisture),
    rawAdc: Math.round(3200 - (soilMoisture * 15)),
    temperature: parseFloat((27 + Math.random() * 2).toFixed(1)),
    humidity: Math.round(75 + Math.random() * 6),
    pumpActive,
    pumpDurationSec: pumpActive ? 15 : 0,
  };

  const startTime = Date.now();

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const latency = Date.now() - startTime;

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Worker Error (${res.status}):`, errText);
      return;
    }

    const data = await res.json();
    const pumpStatus = data.control?.pumpActive ? '🟢 AKTIF (MENYIRAM)' : '⚪ MATI';
    const timeStr = new Date().toLocaleTimeString('id-ID');

    console.log(
      `[${timeStr}] Siklus #${cycle} | Tanah: ${Math.round(soilMoisture)}% | Pompa: ${pumpStatus} | Worker Latency: ${latency}ms`
    );
  } catch (err) {
    console.error(`❌ Gagal terhubung ke Cloudflare Worker (${WORKER_URL}):`, err.message);
  }
}

// Jalankan siklus pertama segera, lalu ulangi setiap 3.5 detik
sendTelemetry();
const interval = setInterval(sendTelemetry, 3500);

process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('\n🛑 Simulator dihentikan.');
  process.exit(0);
});
