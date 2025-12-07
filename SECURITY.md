# Security Policy

## Overview

CF Chat is designed with security as a priority. This document outlines the security measures implemented in the application.

## Authentication

### Password Security
- Passwords are hashed using **bcrypt** with a cost factor of 10
- Minimum password length of 8 characters is enforced
- Passwords are never stored in plain text
- Password reset tokens expire after 1 hour

### JWT Tokens
- Sessions use **JSON Web Tokens** (JWT) signed with HS256
- Tokens expire after 7 days
- Tokens contain minimal user information (userId, email, isAdmin)
- Tokens are validated on every protected request

### Email Verification
- New accounts require email verification before access
- Verification tokens are cryptographically random (32 bytes)
- Verification links expire after 24 hours

### Cookie Security
- Auth cookies are set with `HttpOnly` flag (no JavaScript access)
- `Secure` flag ensures HTTPS-only transmission
- `SameSite=Strict` prevents CSRF attacks
- Cookies have explicit expiration times

## Authorization

### Admin Access
- Only the first registered user becomes an admin
- Admin status is verified on every admin API request
- Admins cannot demote themselves (prevents lockout)
- Non-admin users receive 403 Forbidden on admin routes

### Resource Access
- Users can only access their own conversations
- Users can only manage their own files
- Conversation and file ownership is verified at the database level

## Rate Limiting

### Implementation
- Sliding window rate limiting using Cloudflare KV
- Default limit: 100 requests per user per 24 hours
- Limits are configurable by admins
- Rate limit headers are included in responses

### Headers
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets
- `Retry-After`: Seconds until limit resets (when exceeded)

## File Upload Security

### Size Limits
- Maximum file size: 2 MB
- Size validation occurs before processing

### Type Restrictions
Allowed MIME types:
- `image/jpeg`
- `image/png`
- `image/gif`
- `image/webp`
- `application/pdf`
- `text/plain`
- `text/markdown`
- `application/json`

### Storage
- Files are stored in Cloudflare R2 (isolated bucket)
- Each file has a unique key with user ID prefix
- Original filenames are stored as metadata
- Files are served with proper Content-Type headers

## API Security

### Input Validation
- All API inputs are validated
- TypeScript strict mode ensures type safety
- Invalid inputs return 400 Bad Request

### Error Handling
- Errors are logged server-side
- Generic error messages are returned to users
- No stack traces or internal details exposed

### CORS
- CORS headers are properly configured
- Credentials are supported for cookie-based auth
- Origin restrictions can be configured

## Infrastructure Security

### Cloudflare Workers
- Workers run in isolated V8 environments
- No persistent state between requests (stateless)
- Automatic HTTPS with TLS 1.3

### Data Storage
- D1 database is encrypted at rest
- R2 storage is encrypted at rest
- KV namespace is encrypted at rest

### Secrets Management
- Sensitive values stored as Wrangler secrets
- Secrets are never committed to version control
- Environment variables are encrypted in transit

## AI Security

### Model Access
- AI features can be disabled by admins
- Each AI request is rate-limited
- Usage is logged for auditing

### Content
- AI responses are streamed directly to users
- No additional filtering is applied (relies on model safeguards)
- Administrators can monitor usage patterns

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email security concerns to the repository maintainer
3. Include detailed steps to reproduce the issue
4. Allow reasonable time for a fix before disclosure

## Security Checklist for Deployment

Before deploying to production:

- [ ] Set a strong, unique `JWT_SECRET` (minimum 32 characters)
- [ ] Configure SMTP with encrypted connection (TLS)
- [ ] Set `APP_URL` to your production domain
- [ ] Create Cloudflare API token with minimal permissions
- [ ] Enable Cloudflare firewall rules
- [ ] Set up Cloudflare rate limiting
- [ ] Configure R2 bucket access policies
- [ ] Review D1 access permissions
- [ ] Enable Cloudflare security analytics
- [ ] Set up alerts for unusual activity

## Compliance Notes

This application includes features that support:
- Data minimization (only necessary data collected)
- User data deletion capability
- Audit logging (usage logs)
- Access control (role-based with admin)

Organizations should review and implement additional controls based on their specific compliance requirements (GDPR, SOC2, etc.).
