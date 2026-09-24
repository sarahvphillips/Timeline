import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
} from 'react-native';
import { classifyYearBubbleKind, washStatusLabel } from '../services/eventService';
import EventLabelChips from '../components/EventLabelChips';

export function openEventEditor(navigation, item) {
  if (!navigation || !item) return;
  if (item.source === 'food') navigation.navigate('AddFood', { event: item });
  else if (item.source === 'laundry') navigation.navigate('AddWashLoad', { event: item });
  else if (item.source === 'youtube') navigation.navigate('YouTube', { event: item });
  else if (item.source === 'spotify') navigation.navigate('Spotify', { event: item });
  else if (item.source === 'game') navigation.navigate('Games', { event: item });
  else if (item.source === 'watched' || item.watchKind) navigation.navigate('AddWatched', { event: item });
  else if (item.source === 'social') navigation.navigate('Social', { event: item });
  else if (item.source === 'sms') navigation.navigate('AddSms', { event: item });
  else if (item.source === 'call') navigation.navigate('AddCall', { event: item });
  else if (item.source === 'location') navigation.navigate('AddLocation', { event: item });
  else if (item.source === 'life') navigation.navigate('AddLifeEvent', { event: item });
  else if (item.hobbyType === 'poetry' || item.source === 'poem') navigation.navigate('AddPoem', { event: item });
  else if (item.hobbyType === 'singing' || item.hobbyType === 'music') navigation.navigate('AddSinging', { event: item });
  else if (item.source === 'qr') navigation.navigate('AddQr', { event: item });
  else navigation.navigate('AddEvent', { event: item });
}

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const date = `${dd}/${mm}/${d.getFullYear()}`;
  if (d.getHours() === 0 && d.getMinutes() === 0) return date;
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${date}  ${hh}:${min}`;
}

function Meta({ label, value }) {
  const text = String(value || '').trim();
  if (!text) return null;
  return (
    <Text style={styles.meta}>
      <Text style={styles.metaLabel}>{label} </Text>
      {text}
    </Text>
  );
}

export default function EventViewScreen({ navigation, route }) {
  const event = route.params?.event;
  if (!event) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.empty}>This event could not be opened.</Text>
      </View>
    );
  }

  const kind = classifyYearBubbleKind(event);
  const poem = kind.kind === 'poem';
  const photo = event.coverImageUri || event.imageUri || '';
  const body = String(event.description || event.smsBody || '').trim();
  const callLength =
    Number(event.callMinutes) || Number(event.callSeconds)
      ? `${Number(event.callMinutes) || 0}m ${Number(event.callSeconds) || 0}s`
      : '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.kind, { borderColor: kind.color || '#8b5cf6' }]}>
        <Text style={[styles.kindText, { color: kind.color || '#c4b5fd' }]}>{kind.label || 'Event'}</Text>
      </View>
      <Text style={styles.title}>{event.title || 'Untitled'}</Text>
      <Text style={styles.when}>{formatWhen(event.date)}</Text>

      {photo ? <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" /> : null}

      <EventLabelChips labels={event.labels} />

      <Meta label="From" value={event.emailFrom} />
      <Meta label="Contact" value={event.smsContact} />
      <Meta label="Direction" value={event.smsDirection || event.callDirection} />
      <Meta label="Length" value={callLength} />
      <Meta label="Place" value={event.location || event.placeName || event.smsLocation} />
      <Meta label="Book" value={event.collectionName} />
      <Meta label="Wash" value={event.source === 'laundry' ? washStatusLabel(event.washStatus) : ''} />
      <Meta label="Link" value={event.qrLink || event.url} />

      {body ? (
        <View style={[styles.body, poem && styles.bodyPoem, { borderLeftColor: kind.color || '#3b82f6' }]}>
          <Text style={[styles.bodyText, poem && styles.poemText]}>{body}</Text>
        </View>
      ) : (
        <Text style={styles.noBody}>No extra text was saved with this.</Text>
      )}

      <TouchableOpacity style={styles.edit} onPress={() => openEventEditor(navigation, event)} activeOpacity={0.85}>
        <Text style={styles.editText}>Edit</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 22, paddingBottom: 48 },
  emptyWrap: { flex: 1, backgroundColor: '#0f1024', justifyContent: 'center', alignItems: 'center' },
  empty: { color: '#94a3b8', fontSize: 16 },
  kind: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 14,
  },
  kindText: { fontSize: 13, fontWeight: '700' },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700', lineHeight: 34 },
  when: { color: '#94a3b8', fontSize: 15, marginTop: 8, marginBottom: 16 },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    backgroundColor: '#1a1b36',
    marginBottom: 16,
  },
  meta: { color: '#e2e8f0', fontSize: 15, marginBottom: 6, lineHeight: 22 },
  metaLabel: { color: '#64748b', fontWeight: '600' },
  body: {
    marginTop: 16,
    backgroundColor: '#1a1b36',
    borderRadius: 14,
    borderLeftWidth: 3,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  bodyPoem: { paddingVertical: 20 },
  bodyText: { color: '#e2e8f0', fontSize: 16, lineHeight: 24 },
  poemText: { fontSize: 17, lineHeight: 28 },
  noBody: { color: '#64748b', marginTop: 18, fontSize: 15 },
  edit: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editText: { color: '#93c5fd', fontSize: 16, fontWeight: '700' },
});
