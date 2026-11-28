import { describe, expect, it } from 'vitest';
import { holdsNeverKeptNumber } from './never-kept';

// Card-shaped test numbers are put together at run time (secret scanners read the file as text).
const testCard = ['4111', '1111', '1111', '1111'].join(' ');

describe('holdsNeverKeptNumber', () => {
  it.each([
    'Số CCCD là 001234567890',
    'so tai khoan VCB 0123456789',
    '0123456789 là số tài khoản Techcombank',
    'Tài khoản ngân hàng: 0123 4567 89',
    `Thẻ Visa ${testCard}`,
    `card ${testCard}`,
    'Ho chieu C1234567 so 12345678',
    'Căn cước: 001 234 567 890'.normalize('NFD'),
  ])('refuses: %s', (text) => {
    expect(holdsNeverKeptNumber(text)).toBe(true);
  });

  it.each([
    'Hộ chiếu hết hạn 2027-05-01',
    'Hộ chiếu hết hạn 01/05/2027',
    'Số điện thoại của anh Nam là 0912345678',
    'Port SSH mặc định là 22, server có 64 GB RAM',
    'Mở tài khoản ngân hàng ở VCB năm 2019',
    'Build 20261128 chạy ổn',
  ])('keeps: %s', (text) => {
    expect(holdsNeverKeptNumber(text)).toBe(false);
  });
});
