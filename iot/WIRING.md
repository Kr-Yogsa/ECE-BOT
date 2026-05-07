# ESP8266 + DHT11 + MPU6050 Wiring

Board assumption: NodeMCU ESP8266

## Connections

`DHT11`

- `VCC` -> `3V3`
- `GND` -> `GND`
- `DATA` -> `D4` (`GPIO2`)

If your DHT11 is the bare 4-pin sensor, place a `10k` pull-up resistor between `DATA` and `3V3`.
If your DHT11 is a ready-made module, the pull-up is usually already on the board.

`MPU6050`

- `VCC` -> `3V3`
- `GND` -> `GND`
- `SDA` -> `D2` (`GPIO4`)
- `SCL` -> `D1` (`GPIO5`)
- `AD0` -> `GND`
- `INT` -> not required for this first version

## Important notes

- Keep all grounds common: ESP8266, DHT11, and MPU6050 must share the same `GND`.
- Prefer `3.3V` for both sensors with ESP8266.
- Many MPU6050 breakout boards tolerate `3.3V` safely. Avoid assuming `5V` unless your module documentation clearly says so.
- If the MPU6050 does not appear on I2C scan, double-check `SDA/SCL` and power.

## What "vibration" means here

This sketch calculates vibration on the ESP itself using MPU6050 acceleration samples:

1. Read `50` accelerometer samples.
2. Convert raw acceleration to `g`.
3. Compute magnitude for each sample.
4. Compute RMS variation around the sample window mean.
5. Send that final `vibration` value to MQTT.

That means the server receives only the already-processed vibration value, not the raw MPU6050 axis values.

## MQTT payload

```json
{
  "machine_id": "cnc",
  "temperature": 29.40,
  "humidity": 61.00,
  "vibration": 0.0314,
  "timestamp": "1970-01-01T00:00:12Z"
}
```

## Arduino libraries you need

- `PubSubClient`
- `DHT sensor library`
- `Adafruit MPU6050`
- `Adafruit Unified Sensor`

## Next improvement

For better timestamps, add NTP sync on the ESP8266 so `timestamp` becomes real UTC time instead of uptime-based placeholder time.
