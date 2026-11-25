/**
 * UTILIDADES DE SEGURIDAD Y CRIPTOGRAFÍA — KREDIA
 * 
 * Implementación pura en TypeScript compatible con React Native, Expo y Web.
 * 1. Hasheo criptográfico unidireccional SHA-256 con Salt para contraseñas.
 * 2. Cifrado y descifrado de copias de seguridad (Backups) con contraseña.
 * 3. Enmascaramiento de documentos de identidad (Habeas Data / Privacidad en recibos).
 */

// Implementación estándar y autocontenida de SHA-256 en TypeScript
function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i = 0;
  let j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);

      const temp1 =
        hash[7] +
        (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) +
        ch +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] + s0 + w[i - 7] + s1) | 0);
      const temp2 =
        (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj;

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Genera un Salt pseudo-aleatorio para protección contra tablas arcoíris.
 */
function generateSalt(length = 16): string {
  const chars = 'abcdef0123456789';
  let salt = '';
  for (let i = 0; i < length; i++) {
    salt += chars[Math.floor(Math.random() * chars.length)];
  }
  return salt;
}

export const FORBIDDEN_DEFAULT_PASSWORDS = new Set([
  '123',
  '1234',
  '12345',
  '123456',
  '000',
  '0000',
  '000000',
  'admin',
  'password',
  'cobrador',
]);

/**
 * Determina si una cadena ya corresponde a un hash criptográfico soportado
 * (`sha256$<salt>$<hash>` del móvil o `<32hex>$<64hex>` PBKDF2 de escritorio).
 */
export function isHashedPassword(value?: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith('sha256$')) {
    const parts = trimmed.split('$');
    return parts.length === 3 && parts[1].length > 0 && parts[2].length === 64;
  }
  const parts = trimmed.split('$');
  return (
    parts.length === 2 &&
    /^[0-9a-fA-F]{32}$/.test(parts[0]) &&
    /^[0-9a-fA-F]{64}$/.test(parts[1])
  );
}

/**
 * Valida una contraseña en texto plano con la misma política estricta que LoginView.
 * Retorna mensaje de error si es inválida, o null si es válida.
 */
export function validateSecurePassword(plainPassword: string, label = 'la contraseña'): string | null {
  const clean = (plainPassword || '').trim();
  if (!clean) {
    return `Ingresa ${label}.`;
  }
  if (clean.length < 6) {
    return `Por seguridad, ${label} debe tener al menos 6 caracteres.`;
  }
  if (FORBIDDEN_DEFAULT_PASSWORDS.has(clean.toLowerCase())) {
    return `Por seguridad, ${label} no puede ser una clave común (como 123456, 000000, admin, cobrador o password).`;
  }
  return null;
}

/**
 * Hashea una contraseña usando SHA-256 con Salt.
 * Formato resultante: sha256$<salt>$<hash>
 * Idempotente: si ya es un hash válido (sha256$ o PBKDF2 de escritorio), lo conserva intacto.
 */
export function hashPassword(plainPassword: string, customSalt?: string): string {
  if (!plainPassword) return '';
  if (isHashedPassword(plainPassword)) return plainPassword.trim();
  const salt = customSalt || generateSalt(16);
  const hash = sha256(`${salt}:${plainPassword.trim()}`);
  return `sha256$${salt}$${hash}`;
}

// Constantes estándar SHA-256 (FIPS 180-4)
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function utf8Encode(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(++i);
      const cp = 0x10000 + (((code & 0x3ff) << 10) | (next & 0x3ff));
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  }
  return out;
}

function sha256Compress(state: Uint32Array, block: Uint8Array, offset: number, w: Uint32Array): void {
  for (let i = 0; i < 16; i++) {
    const j = offset + i * 4;
    w[i] = ((block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3]) >>> 0;
  }
  for (let i = 16; i < 64; i++) {
    const w15 = w[i - 15];
    const w2 = w[i - 2];
    const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
    const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
  }

  let a = state[0], b = state[1], c = state[2], d = state[3];
  let e = state[4], f = state[5], g = state[6], h = state[7];

  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (S0 + maj) >>> 0;

    h = g; g = f; f = e; e = (d + temp1) >>> 0;
    d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
  }

  state[0] = (state[0] + a) >>> 0;
  state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0;
  state[3] = (state[3] + d) >>> 0;
  state[4] = (state[4] + e) >>> 0;
  state[5] = (state[5] + f) >>> 0;
  state[6] = (state[6] + g) >>> 0;
  state[7] = (state[7] + h) >>> 0;
}

function sha256Bytes(data: Uint8Array): Uint8Array {
  const state = new Uint32Array(SHA256_IV);
  const w = new Uint32Array(64);
  const len = data.length;
  const paddedLen = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(data);
  buf[len] = 0x80;
  const bitLenHi = Math.floor((len * 8) / 0x100000000);
  const bitLenLo = (len * 8) >>> 0;
  buf[paddedLen - 8] = (bitLenHi >>> 24) & 0xff;
  buf[paddedLen - 7] = (bitLenHi >>> 16) & 0xff;
  buf[paddedLen - 6] = (bitLenHi >>> 8) & 0xff;
  buf[paddedLen - 5] = bitLenHi & 0xff;
  buf[paddedLen - 4] = (bitLenLo >>> 24) & 0xff;
  buf[paddedLen - 3] = (bitLenLo >>> 16) & 0xff;
  buf[paddedLen - 2] = (bitLenLo >>> 8) & 0xff;
  buf[paddedLen - 1] = bitLenLo & 0xff;

  for (let off = 0; off < paddedLen; off += 64) {
    sha256Compress(state, buf, off, w);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (state[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (state[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (state[i] >>> 8) & 0xff;
    out[i * 4 + 3] = state[i] & 0xff;
  }
  return out;
}

/**
 * PBKDF2-HMAC-SHA256 (32 bytes / 256 bits) compatible byte a byte con PasswordHasher.java (Desktop).
 */
function pbkdf2HmacSha256Hex(password: string, salt: Uint8Array, iterations = 65536): string {
  const w = new Uint32Array(64);
  let keyBytes = utf8Encode(password);
  if (keyBytes.length > 64) {
    keyBytes = sha256Bytes(keyBytes);
  }

  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const kb = i < keyBytes.length ? keyBytes[i] : 0;
    ipad[i] = kb ^ 0x36;
    opad[i] = kb ^ 0x5c;
  }

  const ipadState = new Uint32Array(SHA256_IV);
  sha256Compress(ipadState, ipad, 0, w);
  const opadState = new Uint32Array(SHA256_IV);
  sha256Compress(opadState, opad, 0, w);

  const innerState = new Uint32Array(8);
  const outerState = new Uint32Array(8);
  const block64 = new Uint8Array(64);

  // U1 = HMAC(key, salt || INT(1))
  const saltPlusOne = new Uint8Array(salt.length + 4);
  saltPlusOne.set(salt);
  saltPlusOne[salt.length + 3] = 1;

  const firstInnerLen = Math.ceil((saltPlusOne.length + 9) / 64) * 64;
  const firstBuf = new Uint8Array(firstInnerLen);
  firstBuf.set(saltPlusOne);
  firstBuf[saltPlusOne.length] = 0x80;
  const firstBits = (64 + saltPlusOne.length) * 8;
  firstBuf[firstInnerLen - 4] = (firstBits >>> 24) & 0xff;
  firstBuf[firstInnerLen - 3] = (firstBits >>> 16) & 0xff;
  firstBuf[firstInnerLen - 2] = (firstBits >>> 8) & 0xff;
  firstBuf[firstInnerLen - 1] = firstBits & 0xff;

  innerState.set(ipadState);
  for (let off = 0; off < firstInnerLen; off += 64) {
    sha256Compress(innerState, firstBuf, off, w);
  }

  // Outer for U1: 64 bytes opad + 32 bytes inner digest = 96 bytes = 768 bits (0x300)
  block64.fill(0);
  for (let i = 0; i < 8; i++) {
    block64[i * 4] = (innerState[i] >>> 24) & 0xff;
    block64[i * 4 + 1] = (innerState[i] >>> 16) & 0xff;
    block64[i * 4 + 2] = (innerState[i] >>> 8) & 0xff;
    block64[i * 4 + 3] = innerState[i] & 0xff;
  }
  block64[32] = 0x80;
  block64[62] = 0x03;
  block64[63] = 0x00;
  outerState.set(opadState);
  sha256Compress(outerState, block64, 0, w);

  const u = new Uint32Array(outerState);
  const t = new Uint32Array(outerState);

  for (let iter = 1; iter < iterations; iter++) {
    // Inner: 64 bytes ipad + 32 bytes u = 96 bytes = 768 bits
    for (let i = 0; i < 8; i++) {
      block64[i * 4] = (u[i] >>> 24) & 0xff;
      block64[i * 4 + 1] = (u[i] >>> 16) & 0xff;
      block64[i * 4 + 2] = (u[i] >>> 8) & 0xff;
      block64[i * 4 + 3] = u[i] & 0xff;
    }
    innerState.set(ipadState);
    sha256Compress(innerState, block64, 0, w);

    // Outer: 64 bytes opad + 32 bytes innerState = 96 bytes = 768 bits
    for (let i = 0; i < 8; i++) {
      block64[i * 4] = (innerState[i] >>> 24) & 0xff;
      block64[i * 4 + 1] = (innerState[i] >>> 16) & 0xff;
      block64[i * 4 + 2] = (innerState[i] >>> 8) & 0xff;
      block64[i * 4 + 3] = innerState[i] & 0xff;
    }
    outerState.set(opadState);
    sha256Compress(outerState, block64, 0, w);

    for (let i = 0; i < 8; i++) {
      u[i] = outerState[i];
      t[i] = (t[i] ^ u[i]) >>> 0;
    }
  }

  const outBytes = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    outBytes[i * 4] = (t[i] >>> 24) & 0xff;
    outBytes[i * 4 + 1] = (t[i] >>> 16) & 0xff;
    outBytes[i * 4 + 2] = (t[i] >>> 8) & 0xff;
    outBytes[i * 4 + 3] = t[i] & 0xff;
  }
  return bytesToHex(outBytes);
}

/**
 * Valida si una contraseña ingresada coincide con el hash almacenado.
 * Soporta:
 * - sha256$<salt>$<hash> (generado por App Móvil)
 * - <saltHex>$<hashHex> (PBKDF2-HMAC-SHA256 65536 iteraciones generado por Escritorio JavaFX)
 * - Compatibilidad retroactiva con texto plano heredado.
 */
export function verifyPassword(plainPassword: string, storedHashOrPlain: string): boolean {
  if (!plainPassword || !storedHashOrPlain) return false;
  const trimmed = plainPassword.trim();
  const stored = storedHashOrPlain.trim();

  // 1. Formato móvil: sha256$salt$hash
  if (stored.startsWith('sha256$')) {
    const parts = stored.split('$');
    if (parts.length === 3) {
      const salt = parts[1];
      const expectedHash = parts[2];
      const computed = sha256(`${salt}:${trimmed}`);
      return computed === expectedHash;
    }
  }

  // 2. Formato escritorio JavaFX (PasswordHasher.java): saltHex(32)$hashHex(64) con PBKDF2-HMAC-SHA256
  if (stored.includes('$')) {
    const parts = stored.split('$');
    if (parts.length === 2 && parts[0].length === 32 && parts[1].length === 64) {
      const saltBytes = hexToBytes(parts[0]);
      if (saltBytes) {
        const computed = pbkdf2HmacSha256Hex(trimmed, saltBytes, 65536);
        return computed.toLowerCase() === parts[1].toLowerCase();
      }
    }
  }

  // 3. Compatibilidad con texto plano preexistente (migración suave)
  return trimmed === stored;
}

/**
 * Cifra un payload de texto (ej. backup JSON) usando una contraseña y verificación de integridad.
 */
export function encryptBackupData(plainJson: string, passwordKey: string): string {
  if (!plainJson || !passwordKey) throw new Error('Se requiere el contenido y la contraseña.');
  const salt = generateSalt(12);
  const keyHash = sha256(`${salt}:${passwordKey.trim()}`);
  const checksum = sha256(plainJson).substring(0, 16);

  // Cifrado de flujo con la clave generada
  let cipherChars: string[] = [];
  for (let i = 0; i < plainJson.length; i++) {
    const charCode = plainJson.charCodeAt(i);
    const keyChar = keyHash.charCodeAt(i % keyHash.length);
    const encrypted = charCode ^ keyChar;
    cipherChars.push(encrypted.toString(16).padStart(4, '0'));
  }

  const cipherHex = cipherChars.join('');
  return JSON.stringify({
    format: 'kredia_backup_enc_v1',
    salt,
    checksum,
    payload: cipherHex,
    exportedAt: new Date().toISOString(),
  });
}

/**
 * Descifra un payload de backup previamente cifrado.
 * Lanza excepción si la contraseña es incorrecta o el archivo fue alterado.
 */
export function decryptBackupData(encryptedJsonString: string, passwordKey: string): string {
  if (!encryptedJsonString || !passwordKey) throw new Error('Datos o clave faltante.');
  let parsed: any;
  try {
    parsed = JSON.parse(encryptedJsonString);
  } catch {
    throw new Error('El archivo no tiene un formato válido de respaldo.');
  }

  if (parsed.format !== 'kredia_backup_enc_v1' || !parsed.salt || !parsed.payload) {
    // Si no está cifrado, devolver tal cual
    return encryptedJsonString;
  }

  const keyHash = sha256(`${parsed.salt}:${passwordKey.trim()}`);
  const cipherHex = parsed.payload;
  let decryptedChars: string[] = [];

  for (let i = 0; i < cipherHex.length; i += 4) {
    const hexSlice = cipherHex.substring(i, i + 4);
    const code = parseInt(hexSlice, 16);
    const keyChar = keyHash.charCodeAt((i / 4) % keyHash.length);
    const originalChar = String.fromCharCode(code ^ keyChar);
    decryptedChars.push(originalChar);
  }

  const decryptedText = decryptedChars.join('');
  const computedChecksum = sha256(decryptedText).substring(0, 16);

  if (computedChecksum !== parsed.checksum) {
    throw new Error('Clave incorrecta o el archivo de copia de seguridad está dañado.');
  }

  return decryptedText;
}

/**
 * Enmascara un número de documento colombiano dejando visibles solo los últimos 4 dígitos.
 * Ejemplo: "1020456789" -> "CC ••••6789"
 */
export function maskDocumentNumber(docNumber: string): string {
  if (!docNumber) return '';
  const clean = docNumber.trim().replace(/\D/g, '');
  if (clean.length <= 4) return clean;
  const visible = clean.slice(-4);
  return `CC ••••${visible}`;
}
