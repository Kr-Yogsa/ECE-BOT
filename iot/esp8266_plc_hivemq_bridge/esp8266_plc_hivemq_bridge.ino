#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <time.h>

// ---------------------------
// Wi-Fi configuration
// ---------------------------
const char* WIFI_SSID = "Tenda_032180";
const char* WIFI_PASSWORD = "tenda50253";

// ---------------------------
// PLC Modbus TCP configuration
// ---------------------------
const char* PLC_IP = "192.168.0.250";
const uint16_t PLC_PORT = 502;
const uint16_t PLC_X0_ADDRESS = 0;
const uint8_t MODBUS_UNIT_ID = 1;

// ---------------------------
// MQTT / HiveMQ configuration
// ---------------------------
const bool USE_MQTT_TLS = true;
const char* MQTT_HOST = "26a14621577146bb8ef8eba0ed990966.s1.eu.hivemq.cloud";
const uint16_t MQTT_PORT = 8883;
const char* MQTT_USERNAME = "yogsa";
const char* MQTT_PASSWORD = "Naruka@2007";
const char* MQTT_CLIENT_ID = "plc-esp8266-bridge";
const char* MQTT_TOPIC = "factory/machine/plc/telemetry";
const char* MACHINE_ID = "plc";

const unsigned long PLC_POLL_INTERVAL_MS = 1000;
const unsigned long MQTT_RECONNECT_INTERVAL_MS = 5000;
const unsigned long WIFI_RECONNECT_INTERVAL_MS = 5000;
const unsigned long NTP_SYNC_TIMEOUT_MS = 15000;

BearSSL::WiFiClientSecure secureClient;
WiFiClient plainClient;
PubSubClient mqttClient(USE_MQTT_TLS ? static_cast<Client&>(secureClient) : static_cast<Client&>(plainClient));
WiFiClient modbusClient;

unsigned long lastPollMs = 0;
unsigned long lastMqttConnectAttemptMs = 0;
unsigned long lastWifiReconnectAttemptMs = 0;
uint16_t modbusTransactionId = 1;

bool hasPublishedState = false;
bool lastPublishedState = false;

void connectToWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print("Connecting to Wi-Fi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startMs < 20000) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected. ESP IP: ");
    Serial.println(WiFi.localIP());
    return;
  }

  Serial.println("Wi-Fi connect failed. Will retry.");
}

void syncTimeIfNeeded() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Syncing NTP time");

  unsigned long startMs = millis();
  time_t now = time(nullptr);

  while (now < 1700000000 && millis() - startMs < NTP_SYNC_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
  }

  Serial.println();

  if (now >= 1700000000) {
    Serial.println("NTP sync complete.");
  } else {
    Serial.println("NTP sync timed out. MQTT payload will use uptime fallback timestamp.");
  }
}

String buildIsoTimestamp() {
  time_t now = time(nullptr);
  if (now >= 1700000000) {
    struct tm timeInfo;
    gmtime_r(&now, &timeInfo);

    char buffer[25];
    strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeInfo);
    return String(buffer);
  }

  unsigned long secondsSinceBoot = millis() / 1000;
  char fallback[25];
  snprintf(fallback, sizeof(fallback), "1970-01-01T00:00:%02luZ", secondsSinceBoot % 60);
  return String(fallback);
}

bool ensureMqttConnected() {
  if (mqttClient.connected()) {
    return true;
  }

  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  unsigned long nowMs = millis();
  if (nowMs - lastMqttConnectAttemptMs < MQTT_RECONNECT_INTERVAL_MS) {
    return false;
  }

  lastMqttConnectAttemptMs = nowMs;
  Serial.print("Connecting to MQTT broker...");

  bool connected;
  if (strlen(MQTT_USERNAME) > 0) {
    connected = mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD);
  } else {
    connected = mqttClient.connect(MQTT_CLIENT_ID);
  }

  if (connected) {
    Serial.println("connected.");
    return true;
  }

  Serial.print("failed, rc=");
  Serial.println(mqttClient.state());
  return false;
}

bool readPlcX0(bool& sensorState) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  if (modbusClient.connected()) {
    modbusClient.stop();
  }

  if (!modbusClient.connect(PLC_IP, PLC_PORT)) {
    Serial.println("PLC Modbus TCP connect failed.");
    return false;
  }

  uint8_t request[12];
  request[0] = highByte(modbusTransactionId);
  request[1] = lowByte(modbusTransactionId);
  request[2] = 0x00;
  request[3] = 0x00;
  request[4] = 0x00;
  request[5] = 0x06;
  request[6] = MODBUS_UNIT_ID;
  request[7] = 0x02;
  request[8] = highByte(PLC_X0_ADDRESS);
  request[9] = lowByte(PLC_X0_ADDRESS);
  request[10] = 0x00;
  request[11] = 0x01;

  modbusClient.write(request, sizeof(request));
  modbusClient.flush();

  const size_t responseLength = 10;
  uint8_t response[responseLength];
  size_t received = 0;
  unsigned long startMs = millis();

  while (received < responseLength && millis() - startMs < 2000) {
    while (modbusClient.available() > 0 && received < responseLength) {
      response[received++] = modbusClient.read();
    }
    delay(1);
  }

  modbusClient.stop();
  modbusTransactionId++;

  if (received < responseLength) {
    Serial.println("PLC response timeout.");
    return false;
  }

  if (response[7] != 0x02) {
    Serial.print("Unexpected Modbus function code: ");
    Serial.println(response[7], HEX);
    return false;
  }

  if (response[8] != 0x01) {
    Serial.print("Unexpected Modbus byte count: ");
    Serial.println(response[8]);
    return false;
  }

  sensorState = (response[9] & 0x01) != 0;
  return true;
}

void publishSensorState(bool sensorState) {
  if (!ensureMqttConnected()) {
    return;
  }

  String timestamp = buildIsoTimestamp();
  String payload = "{";
  payload += "\"machine_id\":\"";
  payload += MACHINE_ID;
  payload += "\",\"proximity\":";
  payload += sensorState ? "1" : "0";
  payload += ",\"timestamp\":\"";
  payload += timestamp;
  payload += "\"}";

  bool published = mqttClient.publish(MQTT_TOPIC, payload.c_str(), true);

  Serial.print("MQTT publish ");
  Serial.println(published ? "success." : "failed.");
  Serial.print("Payload: ");
  Serial.println(payload);

  if (published) {
    hasPublishedState = true;
    lastPublishedState = sensorState;
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println();
  Serial.println("--- ESP8266 PLC to HiveMQ Bridge Starting ---");

  if (USE_MQTT_TLS) {
    secureClient.setInsecure();
  }

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setBufferSize(256);

  connectToWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    syncTimeIfNeeded();
  }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long nowMs = millis();
    if (nowMs - lastWifiReconnectAttemptMs >= WIFI_RECONNECT_INTERVAL_MS) {
      lastWifiReconnectAttemptMs = nowMs;
      connectToWiFi();
      if (WiFi.status() == WL_CONNECTED) {
        syncTimeIfNeeded();
      }
    }
    delay(50);
    return;
  }

  ensureMqttConnected();
  mqttClient.loop();

  unsigned long nowMs = millis();
  if (nowMs - lastPollMs < PLC_POLL_INTERVAL_MS) {
    delay(10);
    return;
  }

  lastPollMs = nowMs;

  bool sensorState = false;
  bool readOk = readPlcX0(sensorState);

  if (!readOk) {
    Serial.println("Skipping MQTT publish because PLC read failed.");
    return;
  }

  Serial.print("PLC X0 proximity state: ");
  Serial.println(sensorState ? "ON" : "OFF");

  if (sensorState) {
    publishSensorState(sensorState);
    return;
  }

  Serial.println("No object detected. Skipping MQTT publish.");
}