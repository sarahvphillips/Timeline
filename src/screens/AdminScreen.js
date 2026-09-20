import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../services/firebase';
import {
  OWNER_EMAIL,
  FEATURES,
  loadAdmin,
  saveAdmin,
  grantAdmin,
  revokeAdmin,
  setGate,
  blockUser,
  unblockUser,
  addInvite,
  roleOf,
  isOwnerEmail,
  isStaff,
} from '../services/adminService';
import { adminGetRewardsByEmail, adminSetRewards, perkLabel } from '../services/rewardsService';

export default function AdminScreen({ navigation }) {
  const email = (auth.currentUser?.email || '').toLowerCase();
  const [state, setState] = useState(null);
  const [grantEmail, setGrantEmail] = useState('');
  const [blockEmail, setBlockEmail] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [notice, setNotice] = useState('');
  const [creditEmail, setCreditEmail] = useState('');
  const [creditLookup, setCreditLookup] = useState(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditBusy, setCreditBusy] = useState(false);

  const notify = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
      window.alert(title + (message ? '\n\n' + message : ''));
      return;
    }
    Alert.alert(title, message);
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadAdmin(email)
        .then((s) => {
          if (!cancelled) setState(s);
        })
        .catch(() => {
          if (!cancelled) setNotice('Could not load admin list.');
        });
      return () => {
        cancelled = true;
      };
    }, [email])
  );

  const commit = async (next) => {
    const saved = await saveAdmin(next);
    setState(saved);
    return saved;
  };

  if (!state) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  const role = roleOf(email, state);
  if (!isStaff(role)) {
    return (
      <View style={styles.pad}>
        <Text style={styles.heading}>Admin only</Text>
        <Text style={styles.intro}>Admins are chosen only by Sarah. There is no self-serve admin.</Text>
      </View>
    );
  }

  const owner = isOwnerEmail(email);

  const onGrant = async () => {
    const r = grantAdmin(state, grantEmail);
    if (!r.ok) {
      setNotice(r.error);
      notify('Admin', r.error);
      return;
    }
    await commit(r.state);
    setGrantEmail('');
    setNotice('Admin granted.');
  };

  const onBlock = async () => {
    const r = blockUser(state, blockEmail);
    if (!r.ok) {
      setNotice(r.error);
      notify('Admin', r.error);
      return;
    }
    await commit(r.state);
    setBlockEmail('');
    setNotice('Blocked.');
  };

  const onInvite = async () => {
    const r = addInvite(state, inviteNote);
    if (!r.ok) {
      setNotice(r.error);
      return;
    }
    await commit(r.state);
    setInviteNote('');
    setNotice(`Invite code ${r.state.invites[0]?.code}`);
  };

  const loadCredits = async () => {
    setCreditBusy(true);
    try {
      const row = await adminGetRewardsByEmail(creditEmail);
      setCreditLookup(row);
      if (row?.missing) setNotice('No rewards record yet for that email.');
      else if (row?.rewards) setCreditAmount(String(row.rewards.credits));
    } catch (e) {
      setNotice(e?.message || 'Could not load credits.');
    } finally {
      setCreditBusy(false);
    }
  };

  const saveCredits = async (value) => {
    setCreditBusy(true);
    try {
      const n = Math.max(0, Number(value));
      const row = await adminSetRewards(creditEmail, { credits: n });
      setCreditLookup(row);
      setCreditAmount(String(row.rewards.credits));
      setNotice(`Credits for ${row.email} set to ${row.rewards.credits}.`);
    } catch (e) {
      setNotice(e?.message || 'Could not save credits.');
    } finally {
      setCreditBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Text style={styles.kicker}>Staff</Text>
      <Text style={styles.heading}>Admin</Text>
      <Text style={styles.intro}>Admins are chosen only by Sarah. Nobody can add themselves.</Text>
      <Text style={styles.meta}>{email} · {role}</Text>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Text style={styles.section}>Admins</Text>
      <Text style={styles.intro}>Owner: {OWNER_EMAIL} — always admin, cannot be removed.</Text>
      {owner ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="friend@example.com"
            placeholderTextColor="#64748b"
            value={grantEmail}
            onChangeText={setGrantEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity style={styles.primary} onPress={onGrant}>
            <Text style={styles.primaryText}>Grant admin</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.intro}>Only the owner can add or remove admins.</Text>
      )}
      {state.admins.length === 0 ? (
        <Text style={styles.muted}>No extra admins yet.</Text>
      ) : (
        state.admins.map((a) => (
          <View key={a} style={styles.row}>
            <Text style={styles.rowText}>{a}</Text>
            {owner ? (
              <TouchableOpacity
                onPress={async () => {
                  const r = revokeAdmin(state, a);
                  if (!r.ok) setNotice(r.error);
                  else {
                    await commit(r.state);
                    setNotice('Admin removed.');
                  }
                }}
              >
                <Text style={styles.link}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))
      )}

      <Text style={styles.section}>Who can see each feature</Text>
      {FEATURES.map((f) => {
        const access = state.gates[f.key];
        return (
          <View key={f.key} style={styles.card}>
            <Text style={styles.rowText}>{f.title}</Text>
            <Text style={styles.muted}>{f.blurb}</Text>
            {owner ? (
              <TouchableOpacity
                style={styles.chip}
                onPress={async () => {
                  const next = access === 'admin' ? 'everyone' : 'admin';
                  const r = setGate(state, f.key, next);
                  if (!r.ok) setNotice(r.error);
                  else await commit(r.state);
                }}
              >
                <Text style={styles.chipText}>{access === 'admin' ? 'Admin only' : 'Everyone'}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.muted}>{access === 'admin' ? 'Admin only' : 'Everyone'}</Text>
            )}
          </View>
        );
      })}

      <Text style={styles.section}>Invite codes</Text>
      <TextInput
        style={styles.input}
        placeholder="Note (optional)"
        placeholderTextColor="#64748b"
        value={inviteNote}
        onChangeText={setInviteNote}
      />
      <TouchableOpacity style={styles.primary} onPress={onInvite}>
        <Text style={styles.primaryText}>New code</Text>
      </TouchableOpacity>
      {state.invites.map((inv) => (
        <View key={inv.code} style={styles.row}>
          <Text style={styles.code}>{inv.code}</Text>
          {inv.note ? <Text style={styles.muted}>{inv.note}</Text> : null}
        </View>
      ))}

      <Text style={styles.section}>Block a user</Text>
      <TextInput
        style={styles.input}
        placeholder="email@example.com"
        placeholderTextColor="#64748b"
        value={blockEmail}
        onChangeText={setBlockEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TouchableOpacity style={styles.ghost} onPress={onBlock}>
        <Text style={styles.ghostText}>Block</Text>
      </TouchableOpacity>
      {state.blocked.map((b) => (
        <View key={b} style={styles.row}>
          <Text style={styles.rowText}>{b}</Text>
          <TouchableOpacity
            onPress={async () => {
              await commit(unblockUser(state, b));
            }}
          >
            <Text style={styles.link}>Unblock</Text>
          </TouchableOpacity>
        </View>
      ))}

      <Text style={styles.section}>Credits</Text>
      <Text style={styles.intro}>
        Stored in Firestore at users/{'{uid}'}/settings/rewards. Look up by email, then set the
        balance. Device copy updates the next time they open the app.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="user@example.com"
        placeholderTextColor="#64748b"
        value={creditEmail}
        onChangeText={setCreditEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TouchableOpacity style={styles.primary} onPress={loadCredits} disabled={creditBusy}>
        <Text style={styles.primaryText}>{creditBusy ? 'Loading…' : 'Look up credits'}</Text>
      </TouchableOpacity>
      {creditLookup && !creditLookup.missing && creditLookup.rewards ? (
        <View style={styles.card}>
          <Text style={styles.rowText}>{creditLookup.email}</Text>
          <Text style={styles.muted}>uid {creditLookup.uid}</Text>
          <Text style={styles.rowText}>Balance: {creditLookup.rewards.credits}</Text>
          {(creditLookup.rewards.unlockedPerks || []).length ? (
            <Text style={styles.muted}>
              Perks: {creditLookup.rewards.unlockedPerks.map(perkLabel).join(', ')}
            </Text>
          ) : (
            <Text style={styles.muted}>No shop perks unlocked.</Text>
          )}
          <TextInput
            style={styles.input}
            placeholder="New balance"
            placeholderTextColor="#64748b"
            value={creditAmount}
            onChangeText={setCreditAmount}
            keyboardType="number-pad"
          />
          <TouchableOpacity
            style={styles.primary}
            onPress={() => saveCredits(creditAmount)}
            disabled={creditBusy}
          >
            <Text style={styles.primaryText}>Set credits</Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => saveCredits((creditLookup.rewards.credits || 0) + 5)}
            >
              <Text style={styles.link}>+5</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => saveCredits(Math.max(0, (creditLookup.rewards.credits || 0) - 5))}
            >
              <Text style={styles.link}>−5</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {state.audit.length ? (
        <>
          <Text style={styles.section}>Audit log</Text>
          {state.audit.slice(0, 12).map((row) => (
            <View key={row.id} style={styles.card}>
              <Text style={styles.rowText}>
                {row.action} · {row.detail}
              </Text>
              <Text style={styles.muted}>
                {row.by} · {String(row.at || '').replace('T', ' ').slice(0, 16)}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#0f1024', justifyContent: 'center', alignItems: 'center' },
  pad: { padding: 20, paddingBottom: 48, backgroundColor: '#0f1024', flexGrow: 1 },
  kicker: { color: '#60a5fa', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  heading: { color: '#f8fafc', fontSize: 28, fontWeight: '700', marginTop: 4 },
  intro: { color: '#94a3b8', fontSize: 13, lineHeight: 18, marginTop: 8 },
  meta: { color: '#64748b', marginTop: 6, marginBottom: 8 },
  notice: { color: '#7dd3fc', marginTop: 10 },
  section: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginTop: 28, marginBottom: 8 },
  muted: { color: '#64748b', fontSize: 13, marginTop: 6 },
  input: {
    backgroundColor: '#1a1b36',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#f8fafc',
    marginTop: 8,
  },
  primary: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  ghost: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  ghostText: { color: '#94a3b8', fontWeight: '700' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#16182e',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  rowText: { color: '#e2e8f0', fontWeight: '600', flex: 1, paddingRight: 8 },
  link: { color: '#60a5fa', fontWeight: '700' },
  card: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#16182e',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  chip: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { color: '#e2e8f0', fontWeight: '600' },
  code: { color: '#f8fafc', fontSize: 18, fontWeight: '700', letterSpacing: 1 },
});
