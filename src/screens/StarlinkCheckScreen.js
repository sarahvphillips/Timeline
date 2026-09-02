import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { checkStarlinkConnection } from '../services/starlinkService';

export default function StarlinkCheckScreen() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const result = await checkStarlinkConnection();
      setStatus(result);
    } catch (e) {
      setError(e.message || 'Something went wrong while checking.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    runCheck();
  }, [runCheck]);

  const getStatusColor = () => {
    if (!status) return '#94a3b8';
    if (status.isStarlink) return '#22c55e';
    if (status.isConnected) return '#f59e0b';
    return '#ef4444';
  };

  const getStatusLabel = () => {
    if (!status) return '—';
    if (status.isStarlink) return 'Connected via Starlink';
    if (status.isConnected) return 'Online (not Starlink)';
    return 'Offline / No connection';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={runCheck} tintColor="#3b82f6" />
      }
    >
      <View style={styles.card}>
        <Text style={styles.heading}>Starlink Connection Check</Text>

        {loading && !status ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Checking connection…</Text>
          </View>
        ) : (
          <>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '22' }]}>
              <View style={[styles.dot, { backgroundColor: getStatusColor() }]} />
              <Text style={[styles.statusText, { color: getStatusColor() }]}>
                {getStatusLabel()}
              </Text>
            </View>

            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            {status && (
              <View style={styles.details}>
                <DetailRow label="Network connected" value={status.isConnected ? 'Yes' : 'No'} />
                <DetailRow label="Connection type" value={status.connectionType || 'Unknown'} />
                <DetailRow label="Public IP" value={status.publicIp || '—'} />
                <DetailRow label="ASN / Org" value={status.org || status.asn || '—'} />
                <DetailRow
                  label="Local dish reachable"
                  value={
                    status.localDishReachable === true
                      ? 'Yes (192.168.100.1)'
                      : status.localDishReachable === false
                      ? 'No'
                      : 'Not checked'
                  }
                />
                <DetailRow
                  label="Detection method"
                  value={status.detectionMethod || '—'}
                />
              </View>
            )}

            <TouchableOpacity
              style={styles.button}
              onPress={runCheck}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Check Again</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={styles.note}>
        Detection uses public IP ASN (AS14593 = Starlink) plus optional local dish check at 192.168.100.1.
        Results are approximate and depend on network conditions.
      </Text>
    </ScrollView>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1024',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#1a1b36',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 20,
    textAlign: 'center',
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    color: '#94a3b8',
    fontSize: 15,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    marginBottom: 24,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  details: {
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  rowLabel: {
    color: '#94a3b8',
    fontSize: 14,
    flex: 1,
  },
  rowValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '500',
    flex: 1.4,
    textAlign: 'right',
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#f87171',
    textAlign: 'center',
    marginBottom: 16,
  },
  note: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
