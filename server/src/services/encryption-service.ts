import crypto from 'crypto'
import { getJwtSecret } from '../utils/jwt-secret.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16

let encryptionKey: Buffer | null = null

function getKey(): Buffer {
  if (encryptionKey) return encryptionKey
  const secret = getJwtSecret()
  // Derive a 256-bit key from JWT_SECRET using SHA-256
  encryptionKey = crypto.createHash('sha256').update(secret).digest()
  return encryptionKey
}

/**
 * Encrypt a plaintext string.
 * Returns: iv:tag:ciphertext (all hex-encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${tag}:${encrypted}`
}

/**
 * Decrypt an encrypted string (format: iv:tag:ciphertext, all hex-encoded).
 */
export function decrypt(encryptedText: string): string {
  const key = getKey()
  const parts = encryptedText.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format')
  }
  const [ivHex, tagHex, ciphertext] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/**
 * Check if a string looks like an encrypted value (iv:tag:ciphertext format).
 */
export function isEncrypted(value: string): boolean {
  return /^[a-f0-9]{32}:[a-f0-9]{32}:[a-f0-9]+$/.test(value)
}

/**
 * Sensitive config field paths that should be encrypted at rest.
 */
export const SENSITIVE_FIELDS = [
  'jwt_secret',
  'jwtSecret',
  'api_key',
  'apiKey',
  'api_secret',
  'apiSecret',
  'password',
  'token',
  'secret',
  'private_key',
  'privateKey',
  'access_key',
  'accessKey',
  'access_secret',
  'accessSecret',
  'db_password',
  'dbPassword',
  'db_password_file',
  'dbPasswordFile',
  'auth_token',
  'authToken'
]

/**
 * Recursively traverse an object and encrypt matching sensitive fields.
 */
export function encryptSensitiveFields(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && SENSITIVE_FIELDS.includes(key) && !isEncrypted(value)) {
      result[key] = encrypt(value)
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = encryptSensitiveFields(value)
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Recursively traverse an object and decrypt encrypted fields.
 */
export function decryptSensitiveFields(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && isEncrypted(value)) {
      try {
        result[key] = decrypt(value)
      } catch {
        result[key] = value
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = decryptSensitiveFields(value)
    } else {
      result[key] = value
    }
  }
  return result
}
