import NetInfo from '@react-native-community/netinfo';

/**
 * Checks whether the device is currently using Starlink.
 * Methods used (in order of confidence):
 * 1. Public IP ASN / organisation name contains Starlink / AS14593
 * 2. Optional local dish probe at 192.168.100.1 (Starlink default)
 */
export async function checkStarlinkConnection() {
  const netState = await NetInfo.fetch();

  const isConnected = netState.isConnected && netState.isInternetReachable !== false;
  const connectionType = netState.type; // wifi, cellular, ethernet, etc.

  let publicIp = null;
  let asn = null;
  let org = null;
  let isStarlink = false;
  let detectionMethod = 'none';
  let localDishReachable = null;

  if (!isConnected) {
    return {
      isConnected: false,
      isStarlink: false,
      connectionType,
      publicIp: null,
      asn: null,
      org: null,
      localDishReachable: null,
      detectionMethod: 'offline',
    };
  }

  // 1. Get public IP
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (ipRes.ok) {
      const ipData = await ipRes.json();
      publicIp = ipData.ip;
    }
  } catch (e) {
    // continue without public IP
  }

  // 2. Lookup ASN / org (free, no key required for low volume)
  if (publicIp) {
    try {
      // ipapi.co is simple and returns asn + org
      const lookupRes = await fetch(`https://ipapi.co/${publicIp}/json/`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (lookupRes.ok) {
        const data = await lookupRes.json();
        asn = data.asn || null;
        org = data.org || data.organization || null;

        const orgLower = (org || '').toLowerCase();
        const asnStr = String(asn || '').toLowerCase();

        if (
          orgLower.includes('starlink') ||
          orgLower.includes('spacex') ||
          asnStr.includes('14593') ||
          asnStr.includes('as14593')
        ) {
          isStarlink = true;
          detectionMethod = 'public-ip-asn';
        }
      }
    } catch (e) {
      // fallback – try another free endpoint if needed
    }
  }

  // 3. Optional local dish check (works only when on the same LAN as the Starlink router/dish)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const dishRes = await fetch('http://192.168.100.1', {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // Any response (even error status) means the host is reachable
    localDishReachable = true;
    if (!isStarlink) {
      // Local dish is a strong signal when public IP lookup fails or is ambiguous
      isStarlink = true;
      detectionMethod = detectionMethod === 'none' ? 'local-dish' : detectionMethod + '+local-dish';
    }
  } catch (e) {
    localDishReachable = false;
  }

  return {
    isConnected: true,
    isStarlink,
    connectionType,
    publicIp,
    asn,
    org,
    localDishReachable,
    detectionMethod: isStarlink ? detectionMethod : 'not-starlink',
  };
}
