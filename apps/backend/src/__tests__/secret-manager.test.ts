import { describe, expect, it } from "vitest";
import { encrypt, decrypt, mask, isEncrypted } from "../services/secret-manager.js";

describe("SecretManager", () => {
  describe("encrypt / decrypt", () => {
    it("should encrypt and decrypt a string round-trip", () => {
      const plaintext = "my-secret-api-key-12345";
      const ciphertext = encrypt(plaintext);

      // Ciphertext should have the prefix
      expect(ciphertext.startsWith("enc:v1:aes256gcm:")).toBe(true);

      // Decrypt should return the original
      const decrypted = decrypt(ciphertext);
      expect(decrypted).toBe(plaintext);
    });

    it("should produce different ciphertext for same plaintext (random IV)", () => {
      const plaintext = "same-value";
      const ct1 = encrypt(plaintext);
      const ct2 = encrypt(plaintext);
      expect(ct1).not.toBe(ct2); // Different IVs
      // But both decrypt to the same value
      expect(decrypt(ct1)).toBe(plaintext);
      expect(decrypt(ct2)).toBe(plaintext);
    });

    it("should handle empty string", () => {
      const ct = encrypt("");
      expect(decrypt(ct)).toBe("");
    });

    it("should handle unicode/emoji", () => {
      const plaintext = "密钥：🔑 我的Token";
      const ct = encrypt(plaintext);
      expect(decrypt(ct)).toBe(plaintext);
    });

    it("should handle very long strings", () => {
      const plaintext = "a".repeat(10000);
      const ct = encrypt(plaintext);
      expect(decrypt(ct)).toBe(plaintext);
    });
  });

  describe("decrypt backward compatibility", () => {
    it("should return plaintext as-is if not encrypted (no prefix)", () => {
      expect(decrypt("plain-value")).toBe("plain-value");
      expect(decrypt("")).toBe("");
      expect(decrypt("abc123")).toBe("abc123");
    });
  });

  describe("mask", () => {
    it("should mask long values: first 3 chars + ***", () => {
      expect(mask("my-secret-key")).toBe("my-***");
    });

    it("should return *** for empty or short values", () => {
      expect(mask("")).toBe("***");
      expect(mask("ab")).toBe("***");
      expect(mask("abc")).toBe("***");
    });

    it("should mask exactly 4+ character values", () => {
      expect(mask("abcd")).toBe("abc***");
    });
  });

  describe("isEncrypted", () => {
    it("should detect encrypted values", () => {
      const ct = encrypt("test");
      expect(isEncrypted(ct)).toBe(true);
    });

    it("should return false for plain values", () => {
      expect(isEncrypted("plain")).toBe(false);
      expect(isEncrypted("")).toBe(false);
    });
  });
});
