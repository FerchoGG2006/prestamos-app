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

/**
 * Hashea una contraseña usando SHA-256 con Salt.
 * Formato resultante: sha256$<salt>$<hash>
 */
export function hashPassword(plainPassword: string, customSalt?: string): string {
  if (!plainPassword) return '';
  const salt = customSalt || generateSalt(16);
  const hash = sha256(`${salt}:${plainPassword.trim()}`);
  return `sha256$${salt}$${hash}`;
}

/**
 * Valida si una contraseña ingresada coincide con el hash almacenado.
 * Es compatible retroactivamente con claves en texto plano preexistentes.
 */
export function verifyPassword(plainPassword: string, storedHashOrPlain: string): boolean {
  if (!plainPassword || !storedHashOrPlain) return false;
  const trimmed = plainPassword.trim();
  const stored = storedHashOrPlain.trim();

  // Si está hasheado con sha256$salt$hash
  if (stored.startsWith('sha256$')) {
    const parts = stored.split('$');
    if (parts.length === 3) {
      const salt = parts[1];
      const expectedHash = parts[2];
      const computed = sha256(`${salt}:${trimmed}`);
      return computed === expectedHash;
    }
  }

  // Compatibilidad con texto plano preexistente (migración suave)
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
