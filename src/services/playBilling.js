import { Platform } from 'react-native';
import { CREDIT_PACKS, applyPurchasedPack } from './rewardsService';

export const PLAY_SKUS = CREDIT_PACKS.map((p) => p.sku);
export const PLAY_PACKAGE = 'com.sarahphillips.timelineapp';

function loadIap() {
  try {
    return require('expo-iap');
  } catch {
    return null;
  }
}

export function playBillingSupported() {
  return Platform.OS === 'android' && !!loadIap();
}

export async function connectPlayBilling() {
  const iap = loadIap();
  if (!iap?.initConnection) {
    const err = new Error(
      'Google Play Billing needs a development build (not Expo Go) with expo-iap. SKUs are 1_credits, 10_credits, 25_credits, 100_credits — same as Mafia.',
    );
    err.code = 'NO_IAP_MODULE';
    throw err;
  }
  await iap.initConnection();
  return true;
}

export async function fetchPlayCreditProducts() {
  const iap = loadIap();
  if (!iap) return [];
  await connectPlayBilling();
  const fetchProducts = iap.fetchProducts || iap.getProducts;
  if (!fetchProducts) return [];
  const list = await fetchProducts({ skus: PLAY_SKUS, type: 'in-app' });
  const rows = Array.isArray(list) ? list : [];
  return PLAY_SKUS.map((sku) => {
    const hit =
      rows.find((p) => p.id === sku || p.productId === sku || p.sku === sku) || null;
    const pack = CREDIT_PACKS.find((p) => p.sku === sku);
    const price =
      hit?.displayPrice ||
      hit?.localizedPrice ||
      hit?.price ||
      (hit?.oneTimePurchaseOfferDetails && hit.oneTimePurchaseOfferDetails.formattedPrice) ||
      null;
    return {
      sku,
      credits: pack?.credits || 0,
      title: hit?.title ? String(hit.title).split('(')[0].trim() : pack?.blurb || sku,
      priceLabel: price || 'Play Store',
      ready: !!hit,
    };
  });
}

export async function buyPlayCreditSku(sku) {
  const pack = CREDIT_PACKS.find((p) => p.sku === sku);
  if (!pack) throw new Error('Unknown credit pack.');
  const iap = loadIap();
  if (!iap?.requestPurchase) {
    const err = new Error('Play Billing is not in this build.');
    err.code = 'NO_IAP_MODULE';
    throw err;
  }
  await connectPlayBilling();
  const purchase = await iap.requestPurchase({
    request: {
      apple: { sku },
      google: { skus: [sku] },
    },
    type: 'in-app',
  });
  const row = Array.isArray(purchase) ? purchase[0] : purchase;
  const productId = row?.productId || row?.id || sku;
  const token = row?.purchaseToken || row?.transactionId || `play-${Date.now()}`;
  const next = await applyPurchasedPack(productId, { purchaseToken: String(token) });
  try {
    if (iap.finishTransaction && row) {
      await iap.finishTransaction({ purchase: row, isConsumable: true });
    }
  } catch (e) {
    console.warn('Play consume/finish failed after credit grant.', e?.message || e);
  }
  return next;
}

export async function endPlayBilling() {
  const iap = loadIap();
  try {
    if (iap?.endConnection) await iap.endConnection();
  } catch {
    /* ignore */
  }
}
