import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateRandomToken, generateId } from '../../lib/auth';

describe('Auth utilities', () => {
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'testpassword123';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'testpassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      // bcrypt includes salt, so hashes should differ
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'testpassword123';
      const hash = await hashPassword(password);
      const result = await verifyPassword(password, hash);
      
      expect(result).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'testpassword123';
      const hash = await hashPassword(password);
      const result = await verifyPassword('wrongpassword', hash);
      
      expect(result).toBe(false);
    });
  });

  describe('generateRandomToken', () => {
    it('should generate a 64-character hex string', () => {
      const token = generateRandomToken();
      
      expect(token).toBeDefined();
      expect(token.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const token1 = generateRandomToken();
      const token2 = generateRandomToken();
      
      expect(token1).not.toBe(token2);
    });
  });

  describe('generateId', () => {
    it('should generate a valid UUID', () => {
      const id = generateId();
      
      expect(id).toBeDefined();
      // UUID v4 format
      expect(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)).toBe(true);
    });

    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(id1).not.toBe(id2);
    });
  });
});
