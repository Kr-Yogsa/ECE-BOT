void setup() {
  Serial.begin(9600);
}

void loop() {
  if (Serial.available() > 0) {
    char data = Serial.read();

    if (data == '1') {
      Serial.println("SUCCESS: Proximity Sensor Triggered!");
    }
  }
}
