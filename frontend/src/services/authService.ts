


// Simple client-side PIN authentication service using SHA-256
const STORAGE_KEY = 'autotally_auth_hash';
const SALT = 'autotally-secure-salt-v1';

/**
 * Pure JavaScript SHA-256 implementation as a fallback for non-secure contexts
 * where crypto.subtle is not available.
 */
const sha256Fallback = (str: string): string => {
  const hash = (s: string) => {
    const chrsz = 8;
    const hexcase = 0;
    const safe_add = (x: number, y: number) => {
      const lsw = (x & 0xFFFF) + (y & 0xFFFF);
      const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
      return (msw << 16) | (lsw & 0xFFFF);
    };
    const S = (X: number, n: number) => (X >>> n) | (X << (32 - n));
    const R = (X: number, n: number) => (X >>> n);
    const Ch = (x: number, y: number, z: number) => ((x & y) ^ ((~x) & z));
    const Maj = (x: number, y: number, z: number) => ((x & y) ^ (x & z) ^ (y & z));
    const Sigma0256 = (x: number) => (S(x, 2) ^ S(x, 13) ^ S(x, 22));
    const Sigma1256 = (x: number) => (S(x, 6) ^ S(x, 11) ^ S(x, 25));
    const Gamma0256 = (x: number) => (S(x, 7) ^ S(x, 18) ^ R(x, 3));
    const Gamma1256 = (x: number) => (S(x, 17) ^ S(x, 19) ^ R(x, 10));
    const core_sha256 = (m: number[], l: number) => {
      const K = [
        0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
        0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
        0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
        0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
        0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
        0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
        0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
        0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2
      ];
      const HASH = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
      const W = new Array(64);
      let a, b, c, d, e, f, g, h, i, j;
      let T1, T2;

      m[l >> 5] |= 0x80 << (24 - l % 32);
      m[((l + 64 >> 9) << 4) + 15] = l;

      for (i = 0; i < m.length; i += 16) {
        a = HASH[0]; b = HASH[1]; c = HASH[2]; d = HASH[3]; e = HASH[4]; f = HASH[5]; g = HASH[6]; h = HASH[7];

        for (j = 0; j < 64; j++) {
          if (j < 16) W[j] = m[j + i];
          else W[j] = safe_add(safe_add(safe_add(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);

          T1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
          T2 = safe_add(Sigma0256(a), Maj(a, b, c));
          h = g; g = f; f = e; e = safe_add(d, T1); d = c; c = b; b = a; a = safe_add(T1, T2);
        }

        HASH[0] = safe_add(a, HASH[0]); HASH[1] = safe_add(b, HASH[1]); HASH[2] = safe_add(c, HASH[2]); HASH[3] = safe_add(d, HASH[3]);
        HASH[4] = safe_add(e, HASH[4]); HASH[5] = safe_add(f, HASH[5]); HASH[6] = safe_add(g, HASH[6]); HASH[7] = safe_add(h, HASH[7]);
      }
      return HASH;
    };
    const str2binb = (str: string): number[] => {
      const bin: number[] = [];
      const mask = (1 << chrsz) - 1;
      for (let i = 0; i < str.length * chrsz; i += chrsz) {
        bin[i >> 5] |= (str.charCodeAt(i / chrsz) & mask) << (24 - i % 32);
      }
      return bin;
    };
    const binb2hex = (binarray: number[]) => {
      const hex_tab = hexcase ? '0123456789ABCDEF' : '0123456789abcdef';
      let str = '';
      for (let i = 0; i < binarray.length * 4; i++) {
        str += hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8 + 4)) & 0xF) +
          hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8)) & 0xF);
      }
      return str;
    };
    return binb2hex(core_sha256(str2binb(s), s.length * chrsz));
  };
  return hash(str);
};

export const hashPin = async (pin: string): Promise<string> => {
  const text = `${pin}${SALT}`;

  // Try built-in Crypto API first
  const crypto = globalThis.crypto;
  if (crypto?.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('Web Crypto failed, falling back to JS implementation', e);
    }
  }

  // Fallback to JS implementation
  return sha256Fallback(text);
};

export const savePin = async (pin: string): Promise<void> => {
  const hash = await hashPin(pin);
  localStorage.setItem(STORAGE_KEY, hash);
};

export const verifyPin = async (pin: string): Promise<boolean> => {
  const storedHash = localStorage.getItem(STORAGE_KEY);
  if (!storedHash) return false;
  const inputHash = await hashPin(pin);
  return inputHash === storedHash;
};

export const hasPinSetup = (): boolean => {
  return !!localStorage.getItem(STORAGE_KEY);
};

export const removePin = (): void => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('autotally_username');
};

export const saveUser = (username: string): void => {
  localStorage.setItem('autotally_username', username);
};

export const getUser = (): string | null => {
  return localStorage.getItem('autotally_username');
};
