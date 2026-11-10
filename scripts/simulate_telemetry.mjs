#!/usr/bin/env node
/**
 * Simulator Telemetri Firestore Real-time - ENZOPONIK
 *
 * Mensimulasikan data sensor kelembaban tanah (Capacitive Soil Moisture)
 * dan status aktuator Pompa Air (Relay) langsung ke Firestore secara real-time.
 *
 * Cara jalankan:
 *   npm run simulate
 *   atau
 *   node scripts/simulate_telemetry.mjs
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyBT0A4A2ah4bfwC3jWrdZnLpr5FiebQDXk',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'enzoponik.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'enzoponik',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log('='.repeat(55));
console.log('🌱 ENZOPONIK - SIMULATOR TELEMETRI FIRESTORE REAL-TIME');
console.log(`📦 Project ID : ${firebaseConfig.projectId}`);
console.log('⚡ Target Doc : telemetry/current & telemetry_history');
console.log('='.repeat(55));
console.log('Tekan Ctrl+C untuk menghentikan simulasi.\n');

// State simulasi
let soilMoisture = 68; // Persentase kelembaban awal
let pumpActive = false;
let cycle = 0;

async function tick() {
  cycle++;

  // Logika fisik cerdas:
  if (pumpActive) {
    // Pompa menyala -> air bertambah cepat
    soilMoisture += Math.floor(Math.random() * 4) + 5; // +5% s.d. +8%
    if (soilMoisture >= 82) {
      pumpActive = false;
      console.log('💧 [PUMP] Target kelembaban 80%+ tercapai. Pompa air otomatis dimatikan.');
    }
  } else {
    // Pompa mati -> air diserap tanaman / penguapan perlahan
    soilMoisture -= (Math.random() * 1.5 + 0.5); // -0.5% s.d. -2%
    if (soilMoisture <= 50) {
      pumpActive = true;
      console.log('⚠️ [ALERT] Kelembaban tanah < 50% (kering)! Pompa air otomatis dinyalakan.');
    }
  }

  // Batasi rentang nilai realistis (30% - 95%)
  soilMoisture = Math.max(30, Math.min(95, parseFloat(soilMoisture.toFixed(1))));

  const payload = {
    soilMoisture: Math.round(soilMoisture),
    pumpActive,
    pumpDurationSec: pumpActive ? 15 : 0,
    timestamp: serverTimestamp(),
    updatedAt: new Date().toISOString(),
  };

  try {
    // 1. Update live singleton doc
    await setDoc(doc(db, 'telemetry', 'current'), payload, { merge: true });

    // 2. Simpan ke history setiap 2 siklus untuk grafik
    if (cycle % 2 === 0) {
      await addDoc(collection(db, 'telemetry_history'), {
        soilMoisture: Math.round(soilMoisture),
        timestamp: serverTimestamp(),
      });
    }

    const timeStr = new Date().toLocaleTimeString('id-ID');
    const pumpStatus = pumpActive ? '🟢 AKTIF (MENYIRAM)' : '⚪ MATI';
    console.log(
      `[${timeStr}] Siklus #${cycle} | Kelembaban Tanah: ${Math.round(soilMoisture)}% | Pompa Air: ${pumpStatus}`
    );
  } catch (err) {
    console.error('❌ Gagal sinkronisasi ke Firestore:', err.message);
  }
}

// Jalankan pertama kali segera, lalu ulangi setiap 3 detik
tick();
const interval = setInterval(tick, 3000);

process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('\n🛑 Simulator dihentikan. Data terakhir tetap tersimpan di Firestore.');
  process.exit(0);
});

