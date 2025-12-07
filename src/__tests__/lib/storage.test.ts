import { describe, it, expect } from 'vitest';
import { validateFile } from '../../lib/storage';

describe('Storage utilities', () => {
  describe('validateFile', () => {
    it('should accept valid file under size limit', () => {
      const result = validateFile({ size: 1024 * 1024, type: 'image/png' });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject file over size limit', () => {
      const result = validateFile({ size: 3 * 1024 * 1024, type: 'image/png' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds');
    });

    it('should accept allowed MIME types', () => {
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
        'text/markdown',
        'application/json',
      ];

      for (const type of allowedTypes) {
        const result = validateFile({ size: 1024, type });
        expect(result.valid).toBe(true);
      }
    });

    it('should reject disallowed MIME types', () => {
      const result = validateFile({ size: 1024, type: 'application/x-executable' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });
  });
});
