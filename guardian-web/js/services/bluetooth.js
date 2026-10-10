/* =========================================================
   GUARDIÁN · Conexión Bluetooth (reemplaza al webhook)
   Envía cada alerta y avistamiento a un dispositivo Bluetooth cercano:
   - Pulseras / llaveros BLE con el servicio "Alerta inmediata" (0x1802):
     pitan o vibran al llegar una alerta.
   - ESP32 / Arduino con "Nordic UART" (ver docs/esp32-guardian-ble.ino):
     reciben el mensaje en texto (JSON) y pueden prender luces, sirenas, etc.
   Funciona en Chrome y Edge (PC y Android). El navegador pide permiso
   la primera vez; Guardián intenta reconectarse solo después.
   ========================================================= */
import { bus } from '../core/bus.js';

const IMMEDIATE_ALERT = 0x1802, ALERT_LEVEL = 0x2a06;
const UART = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';   // donde escribe Guardián
const KEY = 'guardian.bt';

export const bt = { device: null, alertChar: null, uartChar: null, status: 'off', name: '' };
export const btSupported = () => 'bluetooth' in navigator;

function setStatus(status) {
  bt.status = status;
  bus.emit('bt:status', bt);
}

async function attach(device) {
  bt.device = device;
  bt.name = device.name || 'Dispositivo Bluetooth';
  setStatus('connecting');
  device.removeEventListener('gattserverdisconnected', onDisconnect);
  device.addEventListener('gattserverdisconnected', onDisconnect);
  const server = await device.gatt.connect();
  bt.alertChar = null; bt.uartChar = null;
  try { bt.alertChar = await (await server.getPrimaryService(IMMEDIATE_ALERT)).getCharacteristic(ALERT_LEVEL); } catch { /* no tiene alerta inmediata */ }
  try { bt.uartChar = await (await server.getPrimaryService(UART)).getCharacteristic(UART_RX); } catch { /* no es ESP32 UART */ }
  if (!bt.alertChar && !bt.uartChar) {
    device.gatt.disconnect();
    setStatus('off');
    throw new Error(`${bt.name} no tiene un servicio compatible (Alerta inmediata o UART).`);
  }
  localStorage.setItem(KEY, JSON.stringify({ id: device.id, name: bt.name }));
  setStatus('on');
  return bt;
}

let retries = 0;
async function onDisconnect() {
  setStatus('connecting');
  if (retries++ > 5) { setStatus('off'); return; }
  setTimeout(() => attach(bt.device).then(() => { retries = 0; }).catch(() => setStatus('off')), 2000 * retries);
}

/* Elegir y conectar un dispositivo (necesita un clic del usuario) */
export async function connectBluetooth() {
  if (!btSupported()) throw new Error('Este navegador no tiene Bluetooth web. Usa Chrome o Edge.');
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [IMMEDIATE_ALERT, UART] });
  retries = 0;
  return attach(device);
}

/* Al abrir la app intenta reconectar al último dispositivo permitido */
export async function reconnectBluetooth() {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (!saved || !navigator.bluetooth?.getDevices) return;
  try {
    const dev = (await navigator.bluetooth.getDevices()).find((d) => d.id === saved.id);
    if (dev) await attach(dev);
  } catch { setStatus('off'); }
}

export function disconnectBluetooth() {
  localStorage.removeItem(KEY);
  retries = 99;
  bt.device?.gatt?.disconnect();
  bt.device = null;
  setStatus('off');
}

/* Envía un evento: las alertas hacen pitar fuerte; los avistamientos, suave */
export async function btNotify(evento) {
  if (bt.status !== 'on') return;
  try {
    if (bt.alertChar) await bt.alertChar.writeValueWithoutResponse(Uint8Array.of(evento.evento === 'alerta' || evento.evento === 'prueba' ? 2 : 1));
    if (bt.uartChar) {
      const bytes = new TextEncoder().encode(JSON.stringify(evento) + '\n');
      for (let i = 0; i < bytes.length; i += 20) await bt.uartChar.writeValueWithoutResponse(bytes.slice(i, i + 20));
    }
  } catch (e) { console.warn('Bluetooth: no se pudo enviar', e); }
}
