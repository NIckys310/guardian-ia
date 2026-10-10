/* =========================================================
   GUARDIÁN · Receptor Bluetooth para ESP32 (Arduino IDE)
   Recibe las alertas de Guardián por Bluetooth y:
   - prende el LED y suena el zumbador si es una ALERTA,
   - parpadea el LED una vez si es un AVISTAMIENTO.

   Cómo usarlo:
   1. Arduino IDE → Herramientas → Placa → "ESP32 Dev Module".
   2. Conecta un LED al pin 2 (muchos ESP32 ya lo traen) y,
      si tienes, un zumbador activo al pin 4.
   3. Sube este programa.
   4. En Guardián → Ajustes → Bluetooth → Conectar, elige "Guardian-ESP32".
   ========================================================= */
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>

#define LED_PIN 2
#define BUZZER_PIN 4
#define UART_SERVICE "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define UART_RX      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"

String buffer = "";

void alarma() {
  for (int i = 0; i < 6; i++) {
    digitalWrite(LED_PIN, HIGH); digitalWrite(BUZZER_PIN, HIGH); delay(150);
    digitalWrite(LED_PIN, LOW);  digitalWrite(BUZZER_PIN, LOW);  delay(100);
  }
}

void avistamiento() {
  digitalWrite(LED_PIN, HIGH); delay(300); digitalWrite(LED_PIN, LOW);
}

class Receptor : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) {
    buffer += String(c->getValue().c_str());
    int fin = buffer.indexOf('\n');
    if (fin < 0) return;                       // el mensaje llega en partes
    String msg = buffer.substring(0, fin);
    buffer = buffer.substring(fin + 1);
    Serial.println("Guardián: " + msg);
    if (msg.indexOf("\"alerta\"") >= 0 || msg.indexOf("\"prueba\"") >= 0) alarma();
    else avistamiento();
  }
};

class Conexion : public BLEServerCallbacks {
  void onConnect(BLEServer *s) { Serial.println("Guardián conectado"); }
  void onDisconnect(BLEServer *s) { Serial.println("Guardián desconectado"); s->getAdvertising()->start(); }
};

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  BLEDevice::init("Guardian-ESP32");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new Conexion());
  BLEService *uart = server->createService(UART_SERVICE);
  BLECharacteristic *rx = uart->createCharacteristic(UART_RX, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new Receptor());
  uart->start();
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(UART_SERVICE);
  adv->start();
  Serial.println("Esperando a Guardián por Bluetooth…");
}

void loop() { delay(1000); }
