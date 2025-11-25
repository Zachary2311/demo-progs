# Security & Bug Fixes - Critical Issues Resolved

This document details all critical security vulnerabilities, DevOps issues, logic bugs, and code quality improvements that have been identified and fixed.

## Summary of Fixes

### Security Vulnerabilities (Critical)
1. ✅ **Tokens Leaked via URL** - Switched to HTTP-only cookies
2. ✅ **File Upload Type Validation** - Added magic number verification
3. ✅ **Insecure YouTube URL Parsing** - Strict regex validation

### DevOps & Deployment Issues
4. ✅ **Vite Environment Variables in Docker** - Added ARG support
5. ✅ **Database Volume Mismatch** - Standardized volume names

### Logic & Concurrency Bugs
6. ✅ **User Creation Race Condition** - Using upsert instead of find+create
7. ✅ **Refresh Token Logic Loop** - Clear localStorage before redirect
8. ✅ **Quiz Scoring Division by Zero** - Handle zero maxScore

### Code Quality & Best Practices
9. ✅ **Hardcoded Secrets in Docs** - Added warnings and removed examples
10. ✅ **Excessive Use of 'any'** - Replaced with proper TypeScript types

---

## Detailed Fixes

### 1. Tokens Leaked via URL (CRITICAL)

**Problem:** Tokens were passed in URL query parameters, exposing them to:
- Browser history
- Proxy logs
- Referer headers
- Server logs

**Old Code:**
```typescript
res.redirect(`${frontendUrl}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`);
```

**Fixed Approach:**
- Use HTTP-only, secure cookies for token storage
- Tokens never appear in URLs
- Auto-included in requests via cookies
- Protected from XSS attacks

**Implementation:**
See `/backend/src/controllers/auth.controller.ts`
See `/backend/src/middleware/cookie.middleware.ts`

**New Dependencies:**
- `cookie-parser` for cookie handling
- Updated CORS to support credentials

---

### 2. File Upload Type Validation (CRITICAL)

**Problem:** MIME type can be spoofed by attackers

**Old Code:**
```typescript
if (allowedTypes.includes(file.mimetype)) { ... }
```

**Fixed Approach:**
- Verify file signature (magic numbers)
- Check actual file content, not just MIME type
- Reject files that don't match expected signatures

**Implementation:**
Uses `file-type` library to verify actual file content

---

### 3. Insecure YouTube URL Parsing (HIGH)

**Problem:** Loose string matching allows malicious URLs

**Old Code:**
```typescript
lesson.videoUrl.includes('youtube.com')
```

**Fixed Approach:**
```typescript
const YOUTUBE_REGEX = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
const VIMEO_REGEX = /^https?:\/\/(www\.)?vimeo\.com\/\d+/;

const isValidVideo = YOUTUBE_REGEX.test(url) || VIMEO_REGEX.test(url);
```

---

### 4. Vite Environment Variables in Docker (MAJOR)

**Problem:** Vite embeds environment variables at build time, but Docker Compose injects them at runtime

**Fixed Frontend Dockerfile:**
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app

# Accept build arguments
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci
COPY . .

# Build with environment variable
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Updated docker-compose.yml:**
```yaml
frontend:
  build:
    context: ./frontend
    args:
      VITE_API_URL: ${API_URL:-http://localhost:3001}
```

---

### 5. Database Volume Mismatch (MEDIUM)

**Problem:** docker-compose.yml used `mysql_data` while docs used `lms-mysql-data`

**Fix:** Standardized to `lms_mysql_data` everywhere

**Updated docker-compose.yml:**
```yaml
volumes:
  lms_mysql_data:
  backend_uploads:
```

**Updated docs/DOCKER.md:**
All references now use `lms_mysql_data`

---

### 6. User Creation Race Condition (HIGH)

**Problem:** Concurrent Discord callbacks can create duplicate users

**Old Code:**
```typescript
let user = await prisma.user.findUnique({ where: { discordId } });
if (!user) {
  user = await prisma.user.create({ ... });
}
```

**Fixed Code:**
```typescript
const user = await prisma.user.upsert({
  where: { discordId: discordUser.id },
  update: {
    username: discordUser.username,
    discriminator: discordUser.discriminator,
    email: discordUser.email,
    avatar: discordUser.avatar,
  },
  create: {
    discordId: discordUser.id,
    username: discordUser.username,
    // ... rest of fields
    roles: {
      create: {
        role: {
          connectOrCreate: {
            where: { name: 'student' },
            create: { name: 'student', description: 'Student role' },
          },
        },
      },
    },
  },
  include: {
    roles: { include: { role: true } },
  },
});
```

---

### 7. Refresh Token Logic Loop (MEDIUM)

**Problem:** Failed refresh redirects to /login, which might redirect back

**Old Code:**
```typescript
catch (refreshError) {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  window.location.href = '/login';
}
```

**Fixed Code:**
```typescript
catch (refreshError) {
  // Clear ALL auth data before redirect
  localStorage.clear();
  sessionStorage.clear();

  // Clear cookies if using cookie-based auth
  document.cookie.split(";").forEach(c => {
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
  });

  window.location.href = '/login';
  return Promise.reject(refreshError);
}
```

---

### 8. Quiz Scoring Division by Zero (MEDIUM)

**Problem:** Quiz with 0 points possible causes NaN

**Old Code:**
```typescript
const isPassed = (totalScore / attempt.maxScore) * 100 >= attempt.quiz.passingScore;
```

**Fixed Code:**
```typescript
// Handle edge case of zero max score
const isPassed = attempt.maxScore > 0
  ? (totalScore / attempt.maxScore) * 100 >= attempt.quiz.passingScore
  : false;
```

---

### 9. Hardcoded Secrets in Docs (LOW)

**Problem:** Example commands had placeholder secrets that might be copied

**Fix:** Added prominent warnings and removed actual secret examples

**Updated QUICK_START.md:**
```markdown
⚠️ **SECURITY WARNING**: Never use these example values in production!
Generate strong random secrets:

```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Minimum Requirements:**
- JWT secrets must be at least 64 characters
- Use cryptographically random strings
- Never commit secrets to version control
- Rotate secrets periodically
```

---

### 10. Excessive Use of 'any' (LOW)

**Problem:** TypeScript `any` bypasses type safety

**Fixed Files:**
- `frontend/src/pages/instructor/Dashboard.tsx`
- `frontend/src/pages/admin/Dashboard.tsx`
- `frontend/src/pages/student/Dashboard.tsx`

**Before:**
```typescript
dashboardData.courses.map((course: any) => ...)
```

**After:**
```typescript
import { Course, DashboardData } from '../../types';

dashboardData.courses.map((course: Course) => ...)
```

---

## Testing Checklist

### Security Tests
- [ ] Verify tokens not in URL after login
- [ ] Check cookies are HTTP-only and Secure
- [ ] Test file upload rejects spoofed MIME types
- [ ] Verify YouTube URL validation rejects malicious URLs

### DevOps Tests
- [ ] Build Docker images with correct env vars
- [ ] Verify database persists across restarts
- [ ] Test both Docker Compose and standalone methods

### Logic Tests
- [ ] Test concurrent logins don't create duplicate users
- [ ] Verify refresh token failure clears all auth data
- [ ] Test quiz with 0 points doesn't crash

### Code Quality
- [ ] No TypeScript `any` in critical paths
- [ ] All secrets are environment variables
- [ ] Documentation warns against hardcoded values

---

## Migration Guide

### For Existing Deployments

1. **Update Dependencies:**
```bash
cd backend
npm install cookie-parser@^1.4.6 file-type@^16.5.4
npm install --save-dev @types/cookie-parser@^1.4.6
```

2. **Update Environment Variables:**
Add to `.env`:
```env
# No new vars needed, but ensure these are strong:
JWT_SECRET=<64+ character random string>
JWT_REFRESH_SECRET=<64+ character random string>
```

3. **Rebuild Docker Images:**
```bash
docker-compose build
docker-compose up -d
```

4. **Clear Client Storage:**
Instruct users to clear browser data or implement auto-clear on next login

---

## Security Best Practices Going Forward

### Development
- Never log tokens or sensitive data
- Use environment variables for all secrets
- Enable security linters (eslint-plugin-security)
- Regular dependency updates

### Deployment
- Always use HTTPS in production
- Enable HSTS headers
- Rotate secrets periodically
- Monitor for suspicious activity
- Regular security audits

### Code Review
- Check for SQL injection risks
- Verify input validation
- Review authentication flows
- Test error handling
- Validate file uploads

---

## Additional Recommendations

### Short Term
1. Implement rate limiting on file uploads
2. Add file size limits per user role
3. Implement CAPTCHA for login
4. Add audit logging for admin actions

### Medium Term
1. Implement Content Security Policy (CSP)
2. Add Subresource Integrity (SRI) for CDN assets
3. Set up automated security scanning
4. Implement API versioning

### Long Term
1. Add two-factor authentication (2FA)
2. Implement OAuth2 scopes for fine-grained permissions
3. Add intrusion detection system
4. Regular penetration testing

---

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Docker Security](https://docs.docker.com/engine/security/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

---

**All critical issues have been addressed. The platform is now significantly more secure.**
