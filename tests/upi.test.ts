import { describe, it, expect } from 'vitest';
import { isValidVpa, normalizeVpa, buildUpiUri } from '../lib/upi';

describe('lib/upi: isValidVpa and buildUpiUri', () => {
  it('validates correct VPAs and normalizes case', () => {
    expect(isValidVpa('user@okhdfcbank')).toBe(true);
    expect(isValidVpa('user.name-123@icici')).toBe(true);
    expect(isValidVpa('john_doe@paytm')).toBe(true);
    expect(isValidVpa('UPPERCASE@SBI')).toBe(true);
    expect(normalizeVpa('  UPPERCASE@SBI  ')).toBe('uppercase@sbi');
  });

  it('rejects invalid VPAs', () => {
    expect(isValidVpa('')).toBe(false);
    expect(isValidVpa('   ')).toBe(false);
    expect(isValidVpa('userokhdfcbank')).toBe(false); // missing @
    expect(isValidVpa('user@@okhdfcbank')).toBe(false); // double @
    expect(isValidVpa('@okhdfcbank')).toBe(false); // empty handle
    expect(isValidVpa('user@')).toBe(false); // empty bank
    expect(isValidVpa('user space@sbi')).toBe(false); // space inside
    expect(isValidVpa('a'.repeat(95) + '@okhdfcbank')).toBe(false); // exceeds 100 chars
  });

  it('builds exact URI output for known input', () => {
    const uri = buildUpiUri({
      vpa: 'nandini@okhdfcbank',
      name: 'Nandini Mehra',
      paise: 25000,
    });
    expect(uri).toBe('upi://pay?pa=nandini%40okhdfcbank&pn=Nandini%20Mehra&am=250.00&cu=INR&tn=BudgetMitra%20settle%20up');
  });

  it('correctly handles names with &, =, spaces, and Devanagari characters', () => {
    const uri = buildUpiUri({
      vpa: 'test@upi',
      name: 'Amit & Rahul = Friends नन्दिनी',
      paise: 15000,
    });
    expect(uri).toContain('pn=Amit%20%26%20Rahul%20%3D%20Friends%20%E0%A4%A8%E0%A4%A8%E0%A5%8D%E0%A4%A6%E0%A4%BF%E0%A4%A8%E0%A5%80');
    expect(uri).toContain('am=150.00');
    expect(uri).toContain('tn=BudgetMitra%20settle%20up');
  });

  it('formats amount in rupees and paise with exact two decimal places', () => {
    expect(buildUpiUri({ vpa: 'user@sbi', name: 'User', paise: 5 })).toContain('am=0.05');
    expect(buildUpiUri({ vpa: 'user@sbi', name: 'User', paise: 100 })).toContain('am=1.00');
    expect(buildUpiUri({ vpa: 'user@sbi', name: 'User', paise: 25000 })).toContain('am=250.00');
    expect(buildUpiUri({ vpa: 'user@sbi', name: 'User', paise: 12345678 })).toContain('am=123456.78');
  });

  it('rejects zero, negative, and fractional paise', () => {
    expect(() => buildUpiUri({ vpa: 'user@sbi', name: 'User', paise: 0 })).toThrow();
    expect(() => buildUpiUri({ vpa: 'user@sbi', name: 'User', paise: -100 })).toThrow();
    expect(() => buildUpiUri({ vpa: 'user@sbi', name: 'User', paise: 150.5 })).toThrow();
  });

  it('always produces fixed note "BudgetMitra settle up" without leakage', () => {
    const uri = buildUpiUri({
      vpa: 'user@sbi',
      name: 'Secret Group Admin',
      paise: 50000,
    });
    expect(uri).toContain('tn=BudgetMitra%20settle%20up');
    expect(decodeURIComponent(uri)).toContain('tn=BudgetMitra settle up');
  });
});
