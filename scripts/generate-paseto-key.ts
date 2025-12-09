/**
 * Generate PASETO Private Key
 * 
 * This script generates an Ed25519 private key for PASETO v4 token signing.
 * Run this script and copy the output to your .env file.
 * 
 * Usage:
 *   bun run scripts/generate-paseto-key.ts
 */

import { generateKeyPairSync } from 'crypto';

console.log('\n🔑 Generating PASETO Private Key (Ed25519)...\n');

// Generate Ed25519 key pair
const { privateKey, publicKey } = generateKeyPairSync('ed25519');

// Export private key in DER format (PKCS8)
const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' });
const privateKeyBase64 = Buffer.from(privateKeyDer).toString('base64');

// Export public key for reference
const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
const publicKeyBase64 = Buffer.from(publicKeyDer).toString('base64');

console.log('=' .repeat(80));
console.log('✅ PASETO PRIVATE KEY GENERATED');
console.log('='.repeat(80));
console.log('\n📋 Copy this to your .env file:\n');
console.log(`PASETO_PRIVATE_KEY=${privateKeyBase64}`);
console.log('\n' + '='.repeat(80));
console.log('\n📝 Public Key (for reference only, not needed in .env):\n');
console.log(publicKeyBase64);
console.log('\n' + '='.repeat(80));
console.log('\n⚠️  SECURITY NOTES:');
console.log('   - Keep the private key SECRET');
console.log('   - Never commit it to Git');
console.log('   - Use different keys for dev/staging/production');
console.log('   - Rotate keys every 90 days');
console.log('   - Store in secrets manager for production');
console.log('\n' + '='.repeat(80) + '\n');

