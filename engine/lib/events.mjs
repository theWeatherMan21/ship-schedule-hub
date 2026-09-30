// NDJSON event emitter — engine 与 Tauri/Rust 的 stdout 协议
const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

export function emit(type, extra = {}) {
  write({ type, t: new Date().toISOString(), ...extra });
}

export function emitCarrier(carrier, status, extra = {}) {
  write({ type: 'carrier-status', t: new Date().toISOString(), carrier, status, ...extra });
}
