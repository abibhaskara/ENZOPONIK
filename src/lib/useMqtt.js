
import { useEffect, useState, useRef, useCallback } from 'react';
import mqtt from 'mqtt';

const BROKER_URL = import.meta.env.VITE_MQTT_BROKER_URL || 'wss://broker.hivemq.com:8884/mqtt';

const TOPICS = {
  temperature: import.meta.env.VITE_MQTT_TOPIC_TEMP || 'manik/esp32/temp_secret99',
  humidity: import.meta.env.VITE_MQTT_TOPIC_HUM || 'manik/esp32/hum_secret99',
};


const DEVICE_TIMEOUT_MS = 30_000;


export function useMqtt() {
  const [esp32Data, setEsp32Data] = useState({
    temperature: null,
    humidity: null,
    lastSeen: null,
  });

  
  const [brokerConnected, setBrokerConnected] = useState(false);
  
  const [esp32Connected, setEsp32Connected] = useState(false);
  const [esp32Error, setEsp32Error] = useState(null);

  const clientRef  = useRef(null);
  const timeoutRef = useRef(null); 

  
  const markDeviceOffline = useCallback(() => {
    console.warn('[MQTT] ESP32 device heartbeat timeout — marking offline');
    setEsp32Connected(false);
    setEsp32Data({ temperature: null, humidity: null, lastSeen: null });
  }, []);

  
  const resetHeartbeat = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(markDeviceOffline, DEVICE_TIMEOUT_MS);
  }, [markDeviceOffline]);

  useEffect(() => {
    const clientId = `manik_webapp_${Math.random().toString(16).slice(2, 8)}`;

    const mqttClient = mqtt.connect(BROKER_URL, {
      clientId,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    clientRef.current = mqttClient;

    mqttClient.on('connect', () => {
      console.info('[MQTT] Broker connected via WebSocket');
      setBrokerConnected(true);
      setEsp32Error(null);

      const topicList = Object.values(TOPICS);
      mqttClient.subscribe(topicList, { qos: 0 }, (err) => {
        if (err) {
          console.error('[MQTT] Subscribe error:', err.message);
          setEsp32Error(err.message);
        } else {
          console.info('[MQTT] Subscribed to:', topicList.join(', '));
        }
      });
    });

    mqttClient.on('message', (topic, payload, packet) => {
      
      
      if (packet && packet.retain) return;

      const value = parseFloat(payload.toString());
      if (isNaN(value)) return;

      
      setEsp32Connected(prev => {
        if (!prev) console.info('[MQTT] ESP32 device online — receiving data');
        return true;
      });

      
      resetHeartbeat();

      setEsp32Data((prev) => {
        const next = { ...prev, lastSeen: new Date() };
        if (topic === TOPICS.temperature) next.temperature = parseFloat(value.toFixed(1));
        if (topic === TOPICS.humidity)    next.humidity    = Math.round(value);
        return next;
      });
    });

    mqttClient.on('reconnect', () => {
      console.warn('[MQTT] Broker reconnecting…');
      setBrokerConnected(false);
      
    });

    mqttClient.on('offline', () => {
      console.warn('[MQTT] Broker client offline');
      setBrokerConnected(false);
      
      
      
    });

    mqttClient.on('error', (err) => {
      console.error('[MQTT] Error:', err.message);
      setEsp32Error(err.message);
      setBrokerConnected(false);
    });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      mqttClient.end(true);
    };

  }, [resetHeartbeat, markDeviceOffline]);

  const toggleEsp32 = useCallback(() => {
    setEsp32Connected(prev => !prev);
  }, []);

  return { esp32Data, esp32Connected, brokerConnected, esp32Error, toggleEsp32 };
}
