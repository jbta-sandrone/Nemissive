import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sampleRate = 44_100;
const durationSeconds = 0.24;
const sampleCount = Math.floor(sampleRate * durationSeconds);
const dataLength = sampleCount * 2;
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), "../public/sounds/notification.wav");
const wav = Buffer.alloc(44 + dataLength);

wav.write("RIFF", 0);
wav.writeUInt32LE(36 + dataLength, 4);
wav.write("WAVE", 8);
wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(dataLength, 40);

for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate;
  const attack = Math.min(1, time / 0.018);
  const release = Math.min(1, (durationSeconds - time) / 0.075);
  const envelope = Math.max(0, attack * release);
  const firstTone = Math.sin(2 * Math.PI * 659.25 * time);
  const secondTone = Math.sin(2 * Math.PI * 880 * time) * Math.min(1, Math.max(0, (time - 0.055) / 0.035));
  const softHarmonic = Math.sin(2 * Math.PI * 1318.5 * time) * 0.12;
  const sample = Math.max(-1, Math.min(1, (firstTone * 0.52 + secondTone * 0.34 + softHarmonic) * envelope * 0.5));
  wav.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, wav);
