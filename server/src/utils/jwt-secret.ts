import crypto from 'crypto'

let cachedSecret: string | null = null

/**
 * Get the JWT secret.
 * In production, JWT_SECRET environment variable is required.
 * In development, generates a random key (lost on restart).
 */
export function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret

  const secret = process.env.JWT_SECRET

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[FATAL] JWT_SECRET environment variable is required in production mode.\n' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      )
    }
    // Development: auto-generate, lost on restart
    cachedSecret = crypto.randomBytes(32).toString('hex')
    console.warn(
      '[WARN] JWT_SECRET not set, using auto-generated key. ' +
      'For persistent sessions across restarts, set JWT_SECRET environment variable.'
    )
    return cachedSecret
  }

  cachedSecret = secret
  return cachedSecret
}

export function setJwtSecret(secret: string): void {
  cachedSecret = secret
}

export function resetJwtSecret(): void {
  cachedSecret = null
}
