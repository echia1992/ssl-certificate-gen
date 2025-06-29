// lib/acme-helpers.ts
import * as acme from "acme-client";
import forge from "node-forge";

export async function createPrivateKeyPEM(): Promise<string> {
  const privateKey = await acme.crypto.createPrivateKey();

  // Method 1: Direct string conversion (if privateKey is already PEM)
  if (typeof privateKey === "string") {
    return privateKey;
  }

  // Method 2: If it's a Buffer
  if (Buffer.isBuffer(privateKey)) {
    return privateKey.toString();
  }

  // Method 3: Use forge to convert
  try {
    // @ts-ignore - TypeScript might not recognize the exact type
    const forgeKey = forge.pki.privateKeyFromPem(privateKey.toString());
    return forge.pki.privateKeyToPem(forgeKey);
  } catch (e) {
    // If all else fails, just convert to string
    return privateKey;
  }
}

// Alternative approach using acme-client's built-in methods
export async function createCertificateKeyAndCSR(
  domain: string,
  domains: string[]
) {
  // Create private key for certificate
  const certPrivateKey = await acme.crypto.createPrivateKey();

  // Create CSR
  const [key, csr] = await acme.crypto.createCsr({
    commonName: domain,
    altNames: domains,
  });

  // Convert private key to PEM format
  let privateKeyPem: string;

  // Handle different return types from createPrivateKey
  if (typeof certPrivateKey === "string") {
    privateKeyPem = certPrivateKey;
  } else if (Buffer.isBuffer(certPrivateKey)) {
    privateKeyPem = certPrivateKey.toString();
  } else {
    // For any other type, try to convert to string
    privateKeyPem = String(certPrivateKey);
  }

  return {
    privateKeyPem,
    csr: csr.toString(),
  };
}
