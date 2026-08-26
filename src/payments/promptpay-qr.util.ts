import { PromptPayType } from '../database/entities/store-setting.entity';

/**
 * Encodes a Tag-Length-Value (TLV) field according to EMVCo QR Code specifications.
 */
function tlv(id: string, value: string): string {
  const tag = id.padStart(2, '0');
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

/**
 * Calculates standard CRC16-CCITT (polynomial 0x1021, initial value 0xFFFF)
 * as specified by EMVCo QR Code standard.
 */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xff;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Sanitizes and formats the PromptPay identifier.
 * - Phone number: 10 digits starting with 0 -> converted to 0066 + 9 digits (13 chars)
 * - National ID / Tax ID: 13 digits
 */
export function formatPromptPayTarget(
  target: string,
  type: PromptPayType | string,
): { subTag: string; formattedTarget: string } {
  const digits = target.replace(/[^0-9]/g, '');

  if (type === PromptPayType.PHONE || type === 'phone') {
    // Expected 10 digits e.g. 0812345678 -> 0066812345678
    let international = digits;
    if (international.startsWith('0')) {
      international = `0066${international.substring(1)}`;
    } else if (international.startsWith('66')) {
      international = `00${international}`;
    }
    // Tag 01 is Mobile Phone
    return {
      subTag: '01',
      formattedTarget: international.padStart(13, '0'),
    };
  } else {
    // Tag 02 is National ID / Tax ID (13 digits)
    return {
      subTag: '02',
      formattedTarget: digits.padStart(13, '0'),
    };
  }
}

/**
 * Generates an EMVCo-compliant Thai PromptPay QR Payload string.
 *
 * @param promptpayId - Merchant's 10-digit phone or 13-digit National/Tax ID
 * @param type - Identifier type ('phone' | 'national_id')
 * @param amount - Optional transaction amount in THB (if provided, generates dynamic QR with Tag 54)
 * @returns EMVCo QR Payload string ready to be rendered as QR Code
 */
export function generatePromptPayPayload(
  promptpayId: string,
  type: PromptPayType | 'phone' | 'national_id' = PromptPayType.PHONE,
  amount?: number,
): string {
  // 1. Tag 00: Payload Format Indicator (Fixed '01')
  let payload = tlv('00', '01');

  // 2. Tag 01: Point of Initiation Method ('11' for Static, '12' for Dynamic with Amount)
  const isDynamic = typeof amount === 'number' && amount > 0;
  payload += tlv('01', isDynamic ? '12' : '11');

  // 3. Tag 29: Merchant Account Information - PromptPay
  // AID: A000000677010111
  const aid = tlv('00', 'A000000677010111');
  const { subTag, formattedTarget } = formatPromptPayTarget(promptpayId, type);
  const targetTlv = tlv(subTag, formattedTarget);
  const merchantAccountInfo = `${aid}${targetTlv}`;
  payload += tlv('29', merchantAccountInfo);

  // 4. Tag 58: Country Code (Fixed 'TH')
  payload += tlv('58', 'TH');

  // 5. Tag 53: Transaction Currency (764 = THB)
  payload += tlv('53', '764');

  // 6. Tag 54: Transaction Amount (if specified)
  if (isDynamic) {
    const formattedAmount = amount.toFixed(2);
    payload += tlv('54', formattedAmount);
  }

  // 7. Tag 63: Checksum (CRC16)
  // Append Tag 63 with length 04, then calculate checksum over the complete string up to 6304
  const payloadToCrc = `${payload}6304`;
  const checksum = crc16(payloadToCrc);

  return `${payloadToCrc}${checksum}`;
}
