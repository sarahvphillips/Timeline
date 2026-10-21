import React, { useState, useLayoutEffect, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  useWindowDimensions,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { classifyYearBubbleKind, washStatusLabel, getEvents, saveEvent, getNextActionLabel } from '../services/eventService';
import EventLabelChips from '../components/EventLabelChips';
import EventLinkPicker from '../components/EventLinkPicker';
import { copyTextToClipboard, getSharedEvent } from '../services/shareService';
import { normalizeSocialUrl } from '../services/socialService';
import { formatFullDate, getDateFormat, DATE_FORMAT_DMY } from '../services/dateFormat';
import { reminderLabel } from '../services/eventReminder';
import PhotoView from '../components/PhotoView';
import ClipVideo from '../components/ClipVideo';
import { asImageUri } from '../services/imagePicker';
import { useTheme } from '../themeContext';
import { eventsByIds, linkEventGroup, unlinkEvents, eventKindLabel } from '../services/eventLinkService';
import { looksLikeProse, splitIngredientList } from '../services/remakeList';

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
  else if (item.source === 'clip') navigation.navigate('AddGalleryClip', { event: item });
  else if (item.hobbyType === 'poetry' || item.source === 'poem') navigation.navigate('AddPoem', { event: item });
  else if (item.hobbyType === 'singing' || item.hobbyType === 'music') navigation.navigate('AddSinging', { event: item });
  else if (item.source === 'qr') navigation.navigate('AddQr', { event: item });
  else navigation.navigate('AddEvent', { event: item });
}

function formatWhen(iso, dateFormat = DATE_FORMAT_DMY) {
  const date = formatFullDate(iso, dateFormat);
  if (!date) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || (d.getHours() === 0 && d.getMinutes() === 0)) return date;
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${date}  ${hh}:${min}`;
}

function Meta({ label, value, styles }) {
  const text = String(value || '').trim();
  if (!text || !styles) return null;
  return (
    <Text style={styles.meta}>
      <Text style={styles.metaLabel}>{label} </Text>
      {text}
    </Text>
  );
}

export default function EventViewScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const seed = route.params?.event || (route.params?.eventId ? { id: String(route.params.eventId) } : null);
  const linkOnly = !route.params?.event && !!route.params?.eventId;
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [fullOpen, setFullOpen] = useState(false);
  const [dateFormat, setDateFormat] = useState(DATE_FORMAT_DMY);
  const [event, setEvent] = useState(linkOnly ? null : seed || null);
  const [linkLoading, setLinkLoading] = useState(linkOnly);
  const [linked, setLinked] = useState([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [sharedFiles, setSharedFiles] = useState([]);

  const loadLive = useCallback(async () => {
    const id = seed?.id;
    if (!id) return;
    try {
      const all = await getEvents();
      const live = all.find((row) => String(row.id) === String(id));
      if (live) setEvent(live);
      const ids = live?.linkedEventIds || seed?.linkedEventIds || [];
      const rows = await eventsByIds(ids);
      setLinked(rows);
    } catch {
      setLinked([]);
    } finally {
      setLinkLoading(false);
    }
  }, [seed?.id]);

  useFocusEffect(
    useCallback(() => {
      loadLive();
    }, [loadLive])
  );

  // Tickets / PDFs: own events carry event.attachments; a friend's copy reads them from the shared event.
  useEffect(() => {
    let live = true;
    setSharedFiles([]);
    if (!event?.shareId || (Array.isArray(event.attachments) && event.attachments.length)) return undefined;
    getSharedEvent(event.shareId)
      .then((shared) => {
        if (live && Array.isArray(shared?.attachments)) setSharedFiles(shared.attachments);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [event?.shareId, event?.attachments]);

  useEffect(() => {
    getDateFormat().then(setDateFormat).catch(() => setDateFormat(DATE_FORMAT_DMY));
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        event ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('SharePost', { event })}
            accessibilityLabel="Share post"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ paddingHorizontal: 6 }}
          >
            <Ionicons name="share-social-outline" size={24} color="#93c5fd" />
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, event]);
  if (!event) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.empty}>
          {linkLoading ? 'Opening event…' : 'This event could not be opened.'}
        </Text>
      </View>
    );
  }

  const kind = classifyYearBubbleKind(event);
  const poem = kind.kind === 'poem';
  const photo = asImageUri(event.coverImageUri || event.imageUri);
  const body = String(event.description || event.smsBody || '').trim();
  const storedItems = String(event.foodItems || '').trim();
  let ingredientLines = splitIngredientList(storedItems);
  if (!ingredientLines.length && (event.source === 'food' || event.mealKit) && body && !looksLikeProse(body)) {
    ingredientLines = splitIngredientList(body);
  }
  const note = ingredientLines.length && (body === storedItems || !looksLikeProse(body) && !storedItems) ? '' : body;
  const postLink = normalizeSocialUrl(
    event.socialUrl || event.url || event.qrLink || '',
    event.socialPlatform,
  );

  const copyValue = async (value, emptyMsg) => {
    const text = String(value || '').trim();
    if (!text) {
      Alert.alert('Nothing to copy', emptyMsg || 'There is no text here yet.');
      return;
    }
    const ok = await copyTextToClipboard(text);
    Alert.alert(
      ok === 'share' ? 'Share sheet opened' : ok ? 'Copied' : 'Could not copy',
      ok === 'share'
        ? 'Choose Copy or an app.'
        : ok
          ? 'Paste it where you need it.'
          : 'Long-press the text and choose Copy.',
    );
  };
  const callLength =
    Number(event.callMinutes) || Number(event.callSeconds)
      ? `${Number(event.callMinutes) || 0}m ${Number(event.callSeconds) || 0}s`
      : '';
  const files = (Array.isArray(event.attachments) && event.attachments.length ? event.attachments : sharedFiles)
    .filter((f) => f && /^https:\/\//i.test(String(f.url || '')));
  const openFile = (f) =>
    Linking.openURL(f.url).catch(() => Alert.alert('Could not open file', 'Try again when you are online.'));
  const previewHeight = poem ? Math.min(560, Math.round(screenW * 1.45)) : 240;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.kind, { borderColor: kind.color || '#8b5cf6' }]}>
        <Text style={[styles.kindText, { color: kind.color || '#c4b5fd' }]}>{kind.label || 'Event'}</Text>
      </View>
      <Text style={styles.title}>{event.title || 'Untitled'}</Text>
      <Text style={styles.when}>{formatWhen(event.date, dateFormat)}</Text>
      {event.source === 'todo' || event.fromTodo ? (
        <Text style={styles.meta}>Started on the to-do list</Text>
      ) : null}
      {event.source === 'clip' ? (
        <Text style={styles.meta}>
          {event.clipStreamLabel || 'Gallery file'}
          {event.clipKind === 'video' ? ' · video on this device' : ''}
        </Text>
      ) : null}

      {event.source === 'clip' && event.videoUri ? (
        <ClipVideo uri={asImageUri(event.videoUri)} />
      ) : null}

      {photo ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setFullOpen(true)}
          accessibilityLabel="View full image"
        >
          <PhotoView
            uri={photo}
            style={[styles.photo, { height: previewHeight, width: '100%' }]}
            resizeMode="contain"
          />
          <Text style={styles.photoHint}>Tap image to view full size</Text>
        </TouchableOpacity>
      ) : null}

      <EventLabelChips labels={event.labels} />

      <Text style={[styles.metaLabel, { marginTop: 8 }]}>Linked events</Text>
      {linked.length === 0 ? (
        <Text style={styles.noBody}>None yet. Link a poem, YouTube clip, social post or any other event.</Text>
      ) : (
        linked.map((item) => (
          <View key={item.id} style={{ marginBottom: 8 }}>
            <TouchableOpacity onPress={() => navigation.push('EventView', { event: item })}>
              <Text style={{ color: '#7dd3fc', fontWeight: '700' }}>
                {eventKindLabel(item)} · {item.title || 'Untitled'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                await unlinkEvents(event.id, item.id);
                loadLive();
              }}
            >
              <Text style={{ color: '#f87171', fontSize: 12, marginTop: 2 }}>Unlink</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
      <TouchableOpacity style={styles.edit} onPress={() => setLinkOpen(true)} activeOpacity={0.85}>
        <Text style={styles.editText}>Link events</Text>
      </TouchableOpacity>

      <Meta styles={styles} label="From" value={event.emailFrom} />
      <Meta styles={styles} label="Reminder" value={event.remindOn ? reminderLabel(event.remindAt) : ''} />
      <Meta styles={styles} label="Contact" value={event.smsContact} />
      <Meta styles={styles} label="Direction" value={event.smsDirection || event.callDirection} />
      <Meta styles={styles} label="Length" value={callLength} />
      <Meta styles={styles} label="Place" value={event.location || event.placeName || event.smsLocation} />
      <Meta styles={styles} label="Book" value={event.collectionName} />
      <Meta styles={styles} label="Wash" value={event.source === 'laundry' ? washStatusLabel(event.washStatus) : ''} />
      <Meta styles={styles} label="Link" value={event.qrLink || event.url || event.socialUrl} />
      <Meta styles={styles} label="Cook" value={event.cookMinutes ? `${event.cookMinutes} min` : ''} />
      <Meta styles={styles} label="Tags" value={event.mealTags} />
      <Meta styles={styles} label="Card" value={event.cardNumber} />
      <Meta styles={styles} label="Recipe" value={event.recipeUrl} />

      {ingredientLines.length ? (
        <View style={styles.ingredients}>
          <Text style={styles.metaLabel}>Ingredients</Text>
          {ingredientLines.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.ingredient}>{line}</Text>
          ))}
        </View>
      ) : null}

      {event.nextAction && event.nextAction !== 'none' && event.nextAction !== 'done' ? (
        <View style={styles.actionRow}>
          <Text style={[styles.meta, { flex: 1, marginBottom: 0 }]}>
            Next: {getNextActionLabel(event.nextAction)}
          </Text>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={async () => {
              try {
                await saveEvent({ ...event, nextAction: 'done' });
                setEvent({ ...event, nextAction: 'done' });
              } catch (e) {
                Alert.alert('Could not update', e?.message || 'Try again.');
              }
            }}
          >
            <Text style={styles.actionText}>Mark done</Text>
          </TouchableOpacity>
        </View>
      ) : event.nextAction === 'done' ? (
        <Text style={styles.meta}>Next: Done</Text>
      ) : null}

      {files.map((f, i) => (
        <View key={`${f.name || 'file'}-${i}`} style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => openFile(f)}
            accessibilityLabel={`Open ${f.name || 'attachment'}`}
          >
            <Ionicons
              name={f.contentType === 'application/pdf' ? 'document-text-outline' : 'image-outline'}
              size={16}
              color="#7dd3fc"
            />
            <Text style={styles.actionText}>
              {files.length === 1 ? 'Open ticket' : `Open ${f.name || `file ${i + 1}`}`}
            </Text>
          </TouchableOpacity>
        </View>
      ))}

      {event.readingUrl ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => Linking.openURL(event.readingUrl)}
            accessibilityLabel="Play my reading"
          >
            <Ionicons name="play-outline" size={16} color="#7dd3fc" />
            <Text style={styles.actionText}>Play my reading</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {event.driveUrl ? (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(event.driveUrl)}>
            <Ionicons name="open-outline" size={16} color="#7dd3fc" />
            <Text style={styles.actionText}>Open card in Drive</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {postLink ? (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(postLink)}>
            <Ionicons name="open-outline" size={16} color="#7dd3fc" />
            <Text style={styles.actionText}>Open post</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => copyValue(postLink)}>
            <Ionicons name="copy-outline" size={16} color="#7dd3fc" />
            <Text style={styles.actionText}>Copy link</Text>
          </TouchableOpacity>
          {body ? (
            <TouchableOpacity style={styles.actionBtn} onPress={() => copyValue(body)}>
              <Ionicons name="copy-outline" size={16} color="#7dd3fc" />
              <Text style={styles.actionText}>Copy text</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : body ? (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => copyValue(body)}>
            <Ionicons name="copy-outline" size={16} color="#7dd3fc" />
            <Text style={styles.actionText}>Copy text</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {note ? (
        <View style={[styles.body, poem && styles.bodyPoem, { borderLeftColor: kind.color || '#3b82f6' }]}>
          <Text style={[styles.bodyText, poem && styles.poemText]}>{note}</Text>
        </View>
      ) : ingredientLines.length ? null : (
        <Text style={styles.noBody}>No extra text was saved with this.</Text>
      )}

      {poem ? (
        <TouchableOpacity
          style={styles.edit}
          onPress={() => navigation.navigate('ShareEvent', { event })}
          activeOpacity={0.85}
        >
          <Text style={styles.editText}>Share with a friend</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={styles.edit} onPress={() => openEventEditor(navigation, event)} activeOpacity={0.85}>
        <Text style={styles.editText}>Edit</Text>
      </TouchableOpacity>

      <Modal visible={fullOpen} transparent animationType="fade" onRequestClose={() => setFullOpen(false)}>
        <View style={styles.fullWrap}>
          <Pressable style={styles.fullCloseHit} onPress={() => setFullOpen(false)}>
            <Text style={styles.fullClose}>Close</Text>
          </Pressable>
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            contentContainerStyle={styles.fullScroll}
            centerContent
          >
            <PhotoView
              uri={photo}
              style={{ width: screenW, height: Math.max(screenH - 80, screenW * 1.8) }}
              resizeMode="contain"
            />
          </ScrollView>
        </View>
      </Modal>
      <EventLinkPicker
        visible={linkOpen}
        excludeIds={event?.id ? [event.id] : []}
        selectedIds={event?.linkedEventIds || []}
        onClose={() => setLinkOpen(false)}
        onSave={async (ids) => {
          setLinkOpen(false);
          try {
            await linkEventGroup([event.id, ...ids]);
            await loadLive();
          } catch (e) {
            Alert.alert('Could not link', e?.message || 'Try again.');
          }
        }}
      />
    </ScrollView>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  content: { padding: 22, paddingBottom: 48 },
  emptyWrap: { flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' },
  empty: { color: c.faint, fontSize: 16 },
  kind: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 14,
  },
  kindText: { fontSize: 13, fontWeight: '700' },
  title: { color: c.text, fontSize: 28, fontWeight: '700', lineHeight: 34 },
  when: { color: c.faint, fontSize: 15, marginTop: 8, marginBottom: 16 },
  photo: {
    width: '100%',
    height: 240,
    borderRadius: 14,
    backgroundColor: '#0a0b18',
    marginBottom: 6,
  },
  photoHint: {
    color: c.faint,
    fontSize: 13,
    marginBottom: 16,
  },
  fullWrap: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullCloseHit: {
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  fullClose: {
    color: c.blueSoft,
    fontSize: 16,
    fontWeight: '700',
    alignSelf: 'flex-end',
  },
  fullScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  meta: { color: '#e2e8f0', fontSize: 15, marginBottom: 6, lineHeight: 22 },
  metaLabel: { color: c.faint, fontWeight: '600' },
  ingredients: { marginTop: 14 },
  ingredient: { color: c.text, fontSize: 16, lineHeight: 24 },
  body: {
    marginTop: 16,
    backgroundColor: c.card,
    borderRadius: 14,
    borderLeftWidth: 3,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  bodyPoem: { paddingVertical: 20 },
  bodyText: { color: '#e2e8f0', fontSize: 16, lineHeight: 24 },
  poemText: { fontSize: 17, lineHeight: 28 },
  noBody: { color: c.faint, marginTop: 18, fontSize: 15 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  actionText: { color: '#7dd3fc', fontWeight: '700' },
  edit: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: c.blue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editText: { color: c.blueSoft, fontSize: 16, fontWeight: '700' },
});
}

