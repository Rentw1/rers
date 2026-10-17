import * as Crypto from 'expo-crypto';

export const uid = (): string => Crypto.randomUUID();

export function randomBase64Url(bytes = 32): string {
  const b = Crypto.getRandomBytes(bytes);
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Base64Url(input: string): Promise<string> {
  const b64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, { encoding: Crypto.CryptoEncoding.BASE64 });
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
