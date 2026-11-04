import { APP_HOST, brand } from '../brand';

/**
 * The brand words the start screens put in their text, read from brand.ts: the ecosystem's account name
 * ("tài khoản hoandat"), the sign-in host and this app's host.
 */
export const BRAND_WORDS = {
  account: brand.primaryTenant.domain.split('.')[0] ?? brand.primaryTenant.domain,
  idp: new URL(brand.primaryTenant.issuer).host,
  host: APP_HOST,
} as const;
