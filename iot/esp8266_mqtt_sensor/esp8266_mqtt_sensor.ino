#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <DHT.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// Wi-Fi
const char* WIFI_SSID = "_";
const char* WIFI_PASSWORD = "1234qwer";

// MQTT
const char* MQTT_HOST = "26a14621577146bb8ef8eba0ed990966.s1.eu.hivemq.cloud";
const int MQTT_PORT = 8883;
const char* MQTT_USERNAME = "yogsa";
const char* MQTT_PASSWORD = "Naruka@2007";
const char* MQTT_TOPIC = "factory/machine/cnc/telemetry";
const char* MACHINE_ID = "cnc";

// Sensor pins
const int DHT_PIN = D4;  // GPIO2
const int DHT_TYPE = DHT11;

// Publish timing
const unsigned long PUBLISH_INTERVAL_MS = 2000;
const int VIBRATION_SAMPLE_COUNT = 50;
const int SAMPLE_DELAY_MS = 20;

DHT dht(DHT_PIN, DHT_TYPE);
Adafruit_MPU6050 mpu;
WiFiClientSecure wifiClientSecure;
PubSubClient mqttClient(wifiClientSecure);

unsigned long lastPublishAt = 0;

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }

  Serial.println("");
  Serial.println("Wi-Fi connected.");
}

void connectMQTT() {
  while (!mqttClient.connected()) {
    String clientId = String("esp8266-telemetry-") + String(ESP.getChipId(), HEX);

    bool connected;
    if (strlen(MQTT_USERNAME) > 0) {
      connected = mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD);
    } else {
      connected = mqttClient.connect(clientId.c_str());
    }

    if (!connected) {
      Serial.print("MQTT connect failed, state=");
      Serial.println(mqttClient.state());
      delay(2000);
    }
  }

  Serial.println("MQTT connected.");
}

bool setupMpu6050() {
  if (!mpu.begin()) {
    return false;
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  return true;
}

float readVibrationRms() {
  float magnitudeSum = 0.0f;
  float squareDiffSum = 0.0f;
  float magnitudes[VIBRATION_SAMPLE_COUNT];

  for (int i = 0; i < VIBRATION_SAMPLE_COUNT; i++) {
    sensors_event_t accelEvent;
    sensors_event_t gyroEvent;
    sensors_event_t tempEvent;
    mpu.getEvent(&accelEvent, &gyroEvent, &tempEvent);

    float accelX = accelEvent.acceleration.x / 9.80665f;
    float accelY = accelEvent.acceleration.y / 9.80665f;
    float accelZ = accelEvent.acceleration.z / 9.80665f;

    float magnitude = sqrt((accelX * accelX) + (accelY * accelY) + (accelZ * accelZ));
    magnitudes[i] = magnitude;
    magnitudeSum += magnitude;

    delay(SAMPLE_DELAY_MS);
  }

  float meanMagnitude = magnitudeSum / VIBRATION_SAMPLE_COUNT;

  for (int i = 0; i < VIBRATION_SAMPLE_COUNT; i++) {
    float diff = magnitudes[i] - meanMagnitude;
    squareDiffSum += diff * diff;
  }

  return sqrt(squareDiffSum / VIBRATION_SAMPLE_COUNT);
}

String isoTimestampUtc() {
  unsigned long seconds = millis() / 1000;
  unsigned long hours = (seconds / 3600) % 24;
  unsigned long minutes = (seconds / 60) % 60;
  unsigned long secs = seconds % 60;

  char buffer[32];
  snprintf(buffer, sizeof(buffer), "1970-01-01T%02lu:%02lu:%02luZ", hours, minutes, secs);
  return String(buffer);
}

void publishTelemetry() {
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  float vibrationRms = readVibrationRms();

  if (isnan(humidity) || isnan(temperature)) {
    humidity = -1.0f;
    temperature = -1.0f;
  }

  String payload = "{";
  payload += "\"machine_id\":\"" + String(MACHINE_ID) + "\",";
  payload += "\"temperature\":" + String(temperature, 2) + ",";
  payload += "\"humidity\":" + String(humidity, 2) + ",";
  payload += "\"vibration\":" + String(vibrationRms, 4) + ",";
  payload += "\"timestamp\":\"" + isoTimestampUtc() + "\"";
  payload += "}";

  mqttClient.publish(MQTT_TOPIC, payload.c_str());
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  Wire.begin(D2, D1);  // SDA = D2 (GPIO4), SCL = D1 (GPIO5)

  wifiClientSecure.setInsecure();
  connectWiFi();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  setupMpu6050();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqttClient.connected()) {
    connectMQTT();
  }

  mqttClient.loop();

  unsigned long now = millis();
  if (now - lastPublishAt >= PUBLISH_INTERVAL_MS) {
    lastPublishAt = now;
    publishTelemetry();
  }
}
