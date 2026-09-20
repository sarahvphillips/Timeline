import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  BackHandler,
} from 'react-native';
import {
  saveEvent,
  deleteEvent,
  CATEGORIES,
  NEXT_ACTIONS,
  HOBBY_TYPES,
  buildGrokReplyPrompt,
} from '../services/eventService';
import ImageAttachField from '../components/ImageAttachField';
import LabelPicker from '../components/LabelPicker';
import DesignTargetButton from '../components/DesignTargetButton';
import {
  getEventFriendSourceLabel,
  isSharedEventInvitee,
  leaveSharedEvent,
  submitEditSuggestion,
  syncLocalEventFromShared,
  getSharedEvent,
  formatRecentLeftNotice,
  clearRecentLeftNotice,
  formatRecentSuggestionNotice,
  clearRecentSuggestionNotice,
  pendingEditSuggestions,
  countPendingSuggestions,
  approveEditSuggestion,
  declineEditSuggestion,
} from '../services/shareService';
import { auth } from '../services/firebase';

export default function AddEventScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const isEditing = !!existing;
  const fromEmail = route.params?.fromEmail || route.params?.source === 'email' || false;
  const fromHobby = route.params?.fromHobby || false;

  const initialSource = existing?.source
    || route.params?.source
    || (fromHobby ? 'hobby' : fromEmail ? 'email' : 'manual');

  const paramDate = route.params?.date
    ? String(route.params.date).slice(0, 10)
    : null;

  const [title, setTitle] = useState(existing?.title || route.params?.title || '');
  const [description, setDescription] = useState(existing?.description || route.params?.description || '');
  const [emailFrom, setEmailFrom] = useState(existing?.emailFrom || route.params?.emailFrom || '');
  const [date, setDate] = useState(
    existing?.date
      ? existing.date.slice(0, 10)
      : paramDate || new Date().toISOString().slice(0, 10)
  );
  const [category, setCategory] = useState(
    existing?.category || (fromHobby ? 'hobby' : 'personal')
  );
  const [nextAction, setNextAction] = useState(existing?.nextAction || 'none');
  const [source, setSource] = useState(initialSource);
  const [hobbyType, setHobbyType] = useState(existing?.hobbyType || 'poetry');
  const [audioNote, setAudioNote] = useState(existing?.audioNote || '');
  const [readingProgress, setReadingProgress] = useState(existing?.readingProgress || '');
  const [collectionName, setCollectionName] = useState(existing?.collectionName || '');
  const [coverPhotoNote, setCoverPhotoNote] = useState(existing?.coverPhotoNote || '');
  const [photoNote, setPhotoNote] = useState(existing?.photoNote || route.params?.photoNote || '');
  const [imageUri, setImageUri] = useState(existing?.imageUri || route.params?.imageUri || '');
  const [coverImageUri, setCoverImageUri] = useState(existing?.coverImageUri || '');
  const [labels, setLabels] = useState(Array.isArray(existing?.labels) ? existing.labels : []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [suggestionNote, setSuggestionNote] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [leftNotice, setLeftNotice] = useState('');
  const [suggestionNotice, setSuggestionNotice] = useState('');
  const [pendingSuggestions, setPendingSuggestions] = useState([]);
  const [creatorShareId, setCreatorShareId] = useState(existing?.shareId || null);
  const [resolvingId, setResolvingId] = useState(null);
  const scrollRef = useRef(null);
  const keyboardVisibleRef = useRef(false);

  // Android hardware back: dismiss keyboard first instead of leaving without saving.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => {
      keyboardVisibleRef.current = true;
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      keyboardVisibleRef.current = false;
    });
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (keyboardVisibleRef.current) {
        Keyboard.dismiss();
        return true;
      }
      return false;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      backSub.remove();
    };
  }, []);
  const [syncedExisting, setSyncedExisting] = useState(existing);

  useEffect(() => {
    if (route.params?.event) return;
    const p = route.params || {};
    if (!p.fromEmail && p.source !== 'email' && p.source !== 'share' && p.source !== 'image' && !p.shareKey) return;
    if (typeof p.title === 'string') setTitle(p.title);
    if (typeof p.description === 'string') setDescription(p.description);
    if (typeof p.emailFrom === 'string') setEmailFrom(p.emailFrom);
    if (p.date) setDate(String(p.date).slice(0, 10));
    if (p.source) setSource(p.source);
    if (typeof p.imageUri === 'string' && p.imageUri) setImageUri(p.imageUri);
    if (typeof p.photoNote === 'string') setPhotoNote(p.photoNote);
  }, [route.params?.shareKey, route.params?.title, route.params?.description, route.params?.emailFrom, route.params?.date, route.params?.imageUri]);

  useEffect(() => {
    let cancelled = false;
    const applyCreatorNotices = (shared) => {
      if (!shared) return;
      const uid = auth.currentUser?.uid;
      const isCreator = !shared.createdByUid || shared.createdByUid === uid;
      if (!isCreator) return;
      setCreatorShareId(shared.id || existing?.shareId || null);
      const left = formatRecentLeftNotice(shared);
      setLeftNotice(left || '');
      const sug = formatRecentSuggestionNotice(shared);
      setSuggestionNotice(sug || '');
      setPendingSuggestions(pendingEditSuggestions(shared));
    };
    const run = async () => {
      if (!existing?.shareId) {
        setSyncedExisting(existing);
        setLeftNotice('');
        setSuggestionNotice('');
        setPendingSuggestions([]);
        return;
      }
      try {
        const refreshed = await syncLocalEventFromShared(existing);
        if (cancelled) return;
        if (refreshed) {
          setSyncedExisting(refreshed);
          if (typeof refreshed.description === 'string') setDescription(refreshed.description);
          if (typeof refreshed.title === 'string') setTitle(refreshed.title);
          if (refreshed.date) setDate(String(refreshed.date).slice(0, 10));
          if (refreshed.category) setCategory(refreshed.category);
        } else {
          setSyncedExisting(existing);
        }
        const uid = auth.currentUser?.uid;
        if (uid && !isSharedEventInvitee(existing, uid)) {
          const shared = await getSharedEvent(existing.shareId);
          if (!cancelled) applyCreatorNotices(shared);
        }
      } catch (e) {
        console.warn('Could not sync shared event copy', e);
        if (!cancelled) setSyncedExisting(existing);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [existing?.id, existing?.shareId]);

  const notify = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
      window.alert(title + (message ? '\n\n' + message : ''));
      return;
    }
    Alert.alert(title, message);
  };

  const confirmAction = (title, message, confirmLabel = 'OK') => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      return Promise.resolve(window.confirm(title + (message ? '\n\n' + message : '')));
    }
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  const handleSave = async () => {
    if (saving || deleting) return;
    if (existing && isSharedEventInvitee(existing, auth.currentUser?.uid)) {
      notify('Suggest a note', 'Invitees cannot edit this event directly. Use Suggest a note below.');
      return;
    }
    setSaveNotice('');
    if (!title.trim()) {
      notify(
        'Missing title',
        source === 'hobby'
          ? 'Please enter a title (e.g. poem title or song name).'
          : 'Please enter a title for the event.'
      );
      return;
    }

    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      notify('Invalid date', 'Please use the format YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      const saved = {
        id: existing?.id,
        title: title.trim(),
        description: description.trim(),
        date: parsed.toISOString(),
        category: category || (source === 'hobby' ? 'hobby' : 'personal'),
        source,
        nextAction,
        emailFrom: emailFrom.trim() || undefined,
        hobbyType: source === 'hobby' ? hobbyType : undefined,
        audioNote:
          source === 'hobby' && (hobbyType === 'singing' || hobbyType === 'music')
            ? audioNote.trim() || undefined
            : undefined,
        readingProgress:
          source === 'hobby' && hobbyType === 'reading'
            ? readingProgress.trim() || undefined
            : undefined,
        collectionName:
          source === 'hobby' && hobbyType === 'poetry'
            ? collectionName.trim() || undefined
            : undefined,
        coverImageUri:
          source === 'hobby' && hobbyType === 'poetry'
            ? coverImageUri || undefined
            : undefined,
        coverPhotoNote:
          source === 'hobby' && hobbyType === 'poetry'
            ? coverPhotoNote.trim() || undefined
            : undefined,
        imageUri: imageUri || undefined,
        photoNote: photoNote.trim() || undefined,
        labels,
        shareId: existing?.shareId,
        isShared: existing?.isShared,
        sharedFrom: existing?.sharedFrom,
        sharedFromEmail: existing?.sharedFromEmail,
        inviteCode: existing?.inviteCode,
      };
      await saveEvent(saved);

      let notice = isEditing ? 'Updated.' : 'Saved.';
      if (nextAction === 'ask_grok_reply') {
        const prompt = buildGrokReplyPrompt(saved);
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(prompt);
            notice = 'Saved. Grok reply prompt copied to clipboard.';
          } catch (_) {
            notice = 'Saved. Open Grok to draft a reply.';
          }
        } else {
          notice = 'Saved. Open Grok to draft a reply.';
        }
      }
      setSaveNotice(notice);
      notify(isEditing ? 'Updated' : 'Saved', notice);
      navigation.goBack();
    } catch (e) {
      const fail = 'Could not save the event. Please try again.';
      setSaveNotice(fail);
      notify('Error', fail);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing?.id || saving || deleting) return;
    const ok = await confirmAction(
      'Delete event',
      'Delete "' + (title.trim() || existing.title || 'this event') + '"? This removes it from this device'
        + (auth.currentUser ? ' and from your cloud copy.' : '.')
        + (existing?.isShared || existing?.shareId
          ? ' As the creator, deleting your copy may end the share for you; friends who already accepted keep their copies until they leave.'
          : ''),
      'Delete',
    );
    if (!ok) return;
    setDeleting(true);
    setSaveNotice('');
    try {
      await deleteEvent(existing.id);
      setSaveNotice('Deleted.');
      notify('Deleted', 'Event removed.');
      navigation.goBack();
    } catch (e) {
      const fail = e?.message || 'Could not delete. Please try again.';
      setSaveNotice(fail);
      notify('Could not delete', fail);
    } finally {
      setDeleting(false);
    }
  };

  const handleLeave = async () => {
    if (!existing?.id || saving || deleting) return;
    const ok = await confirmAction(
      'Leave event',
      'Leave "' + (title.trim() || existing.title || 'this shared event') + '"? This removes it from your timeline only. Your friend keeps their event.',
      'Leave',
    );
    if (!ok) return;
    setDeleting(true);
    setSaveNotice('');
    try {
      const result = await leaveSharedEvent(existing);
      setSaveNotice('Left shared event.');
      notify('Left event', result?.notice || 'Removed from your timeline. The creator was notified.');
      navigation.goBack();
    } catch (e) {
      const fail = e?.message || 'Could not leave. Please try again.';
      setSaveNotice(fail);
      notify('Could not leave', fail);
    } finally {
      setDeleting(false);
    }
  };


  const handleSuggestNote = async () => {
    if (!existing?.shareId || saving || deleting || suggesting) return;
    const trimmed = suggestionNote.trim();
    if (!trimmed) {
      notify('Suggest a note', 'Write a short note for the creator to approve.');
      return;
    }
    setSuggesting(true);
    setSaveNotice('');
    try {
      const result = await submitEditSuggestion(existing.shareId, trimmed);
      setSuggestionNote('');
      setSaveNotice('Suggestion sent.');
      notify('Suggestion sent', result?.notice || 'Your note was sent to the creator for approval.');
    } catch (e) {
      const fail = e?.message || 'Could not send suggestion. Please try again.';
      setSaveNotice(fail);
      notify('Could not suggest', fail);
    } finally {
      setSuggesting(false);
    }
  };

  const refreshCreatorNotices = async (shareId) => {
    const sid = shareId || creatorShareId || existing?.shareId;
    if (!sid) return;
    try {
      const shared = await getSharedEvent(sid);
      if (!shared) return;
      const left = formatRecentLeftNotice(shared);
      setLeftNotice(left || '');
      const sug = formatRecentSuggestionNotice(shared);
      setSuggestionNotice(sug || '');
      setPendingSuggestions(pendingEditSuggestions(shared));
    } catch (_) {}
  };

  const handleApproveSuggestion = async (suggestionId) => {
    const sid = creatorShareId || existing?.shareId;
    if (!sid || resolvingId) return;
    const ok = await confirmAction(
      'Approve suggestion',
      'Append this note to the shared event description?',
      'Approve',
    );
    if (!ok) return;
    setResolvingId(suggestionId);
    try {
      await approveEditSuggestion(sid, suggestionId);
      notify('Approved', 'Note added to the shared event.');
      const refreshed = await syncLocalEventFromShared({
        ...(syncedExisting || existing),
        shareId: sid,
      });
      if (refreshed && typeof refreshed.description === 'string') {
        setDescription(refreshed.description);
        setSyncedExisting(refreshed);
      }
      await refreshCreatorNotices(sid);
    } catch (e) {
      notify('Could not approve', e?.message || 'Could not approve.');
    } finally {
      setResolvingId(null);
    }
  };

  const handleDeclineSuggestion = async (suggestionId) => {
    const sid = creatorShareId || existing?.shareId;
    if (!sid || resolvingId) return;
    const ok = await confirmAction(
      'Decline suggestion',
      'Decline this suggested note?',
      'Decline',
    );
    if (!ok) return;
    setResolvingId(suggestionId);
    try {
      await declineEditSuggestion(sid, suggestionId);
      notify('Declined', 'Suggestion was declined.');
      await refreshCreatorNotices(sid);
    } catch (e) {
      notify('Could not decline', e?.message || 'Could not decline.');
    } finally {
      setResolvingId(null);
    }
  };

  const descriptionPlaceholder = () => {
    if (source === 'email') return 'Paste a short part of the email or your notes?';
    if (source === 'hobby') {
      if (hobbyType === 'poetry') return 'Write or paste your poem here?';
      if (hobbyType === 'singing') return 'Description of the recording, lyrics notes, mood?';
      if (hobbyType === 'music') return 'Piece name, instrument notes, practice notes?';
      if (hobbyType === 'reading') return 'Thoughts on the book, favourite lines?';
      return 'Notes about this hobby?';
    }
    return 'Optional details?';
  };

  const myUid = auth.currentUser?.uid;
  const eventBase = syncedExisting || existing;
  const eventForLabel = {
    ...(eventBase || {}),
    source: eventBase?.source || source,
    sharedFromEmail: eventBase?.sharedFromEmail,
    sharedFrom: eventBase?.sharedFrom,
    isShared: eventBase?.isShared,
    shareId: eventBase?.shareId,
    fromEmail: eventBase?.fromEmail,
  };
  const friendSourceLabel = getEventFriendSourceLabel(eventForLabel, myUid);
  // Same shared / From friend label as Timeline list (creator: Shared event; invitee: From friend)
  const showSharedSource = !!friendSourceLabel
    || source === 'shared'
    || !!eventBase?.isShared
    || !!eventBase?.shareId
    || !!eventBase?.sharedFromEmail
    || !!(eventBase?.sharedFrom && myUid && eventBase.sharedFrom !== myUid);
  const isInvitee = isSharedEventInvitee(eventBase || eventForLabel, myUid);
  const coreReadOnly = isInvitee;
  const sharedChipLabel = (friendSourceLabel && friendSourceLabel.startsWith('From friend'))
    ? 'From friend'
    : (friendSourceLabel === 'Shared event' ? 'Shared event' : 'From friend');
  const sharedChipSelected = source === 'shared' || showSharedSource;

  const sourceChips = [
    { id: 'manual', label: 'Manual' },
    { id: 'email', label: 'From email' },
    { id: 'hobby', label: 'Hobby' },
  ];
  if (source === 'share' || source === 'image') {
    sourceChips.push({ id: source, label: 'Shared photo' });
  }
  if (showSharedSource) {
    sourceChips.push({ id: 'shared', label: sharedChipLabel });
  }

  const isPoetry = source === 'hobby' && hobbyType === 'poetry';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* TEMP design target — remove when event detail matches sketch. */}
      <DesignTargetButton
        imageSource={require('../../assets/design-event-detail-poetry-night.png')}
        title="Event detail design (temp)"
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.sectionTitle}>
          {source === 'hobby'
            ? isEditing
              ? 'Edit hobby'
              : 'Add hobby'
            : source === 'email'
              ? 'Add email as event'
              : isEditing
                ? 'Edit event'
                : 'New event'}
        </Text>
        <Text style={styles.intro}>
          Choose a type, add a title and date, then save it onto your timeline.
        </Text>

        <Text style={styles.label}>Source</Text>
        <View style={styles.row}>
          {sourceChips.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.sourceChip, (s.id === 'shared' ? sharedChipSelected : (!showSharedSource && source === s.id)) && styles.sourceSelected]}
              onPress={() => {
                if (s.id === 'shared' && isInvitee) {
                  setSource('shared');
                  return;
                }
                if (s.id === 'shared') return;
                setSource(s.id);
                if (s.id === 'hobby') setCategory('hobby');
              }}
            >
              <Text style={[styles.sourceText, (s.id === 'shared' ? sharedChipSelected : (!showSharedSource && source === s.id)) && styles.sourceTextSelected]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {showSharedSource ? (
          <Text style={styles.friendSource}>
            {friendSourceLabel || (isInvitee ? 'From friend' : 'Shared event')}
          </Text>
        ) : null}

        {!isInvitee && isEditing && (leftNotice || suggestionNotice || pendingSuggestions.length) ? (
          <View style={styles.creatorNotices}>
            {leftNotice ? (
              <View style={styles.leftBanner}>
                <Text style={styles.leftBannerText}>{leftNotice}</Text>
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      const sid = creatorShareId || existing?.shareId;
                      if (sid) await clearRecentLeftNotice(sid);
                    } catch (_) {}
                    setLeftNotice('');
                  }}
                >
                  <Text style={styles.noticeDismiss}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {suggestionNotice || pendingSuggestions.length ? (
              <View style={styles.sugBanner}>
                <Text style={styles.sugBannerText}>
                  {suggestionNotice ||
                    (pendingSuggestions.length === 1
                      ? '1 pending note suggestion'
                      : pendingSuggestions.length + ' pending note suggestions')}
                </Text>
                {suggestionNotice ? (
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        const sid = creatorShareId || existing?.shareId;
                        if (sid) await clearRecentSuggestionNotice(sid);
                      } catch (_) {}
                      setSuggestionNotice('');
                    }}
                  >
                    <Text style={styles.noticeDismiss}>Dismiss banner</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {pendingSuggestions.length ? (
              <View style={styles.sugList}>
                <Text style={styles.sugListTitle}>
                  Pending suggestions ({pendingSuggestions.length})
                </Text>
                {pendingSuggestions.map((sug) => (
                  <View key={sug.id} style={styles.sugCard}>
                    <Text style={styles.sugFrom}>
                      From{' '}
                      {(sug.fromEmail && String(sug.fromEmail)) ||
                        sug.fromDisplayName ||
                        'friend'}
                    </Text>
                    <Text style={styles.sugNote}>{sug.note}</Text>
                    <View style={styles.sugActions}>
                      <TouchableOpacity
                        style={[styles.sugApprove, resolvingId && styles.sugDisabled]}
                        onPress={() => handleApproveSuggestion(sug.id)}
                        disabled={!!resolvingId}
                      >
                        <Text style={styles.sugApproveText}>
                          {resolvingId === sug.id ? '…' : 'Approve'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.sugDecline, resolvingId && styles.sugDisabled]}
                        onPress={() => handleDeclineSuggestion(sug.id)}
                        disabled={!!resolvingId}
                      >
                        <Text style={styles.sugDeclineText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {source === 'hobby' && (
          <>
            <Text style={styles.label}>Hobby type</Text>
            <View style={styles.categories}>
              {HOBBY_TYPES.map((h) => {
                const selected = hobbyType === h.id;
                return (
                  <TouchableOpacity
                    key={h.id}
                    style={[styles.catChip, selected && styles.hobbySelected]}
                    onPress={() => setHobbyType(h.id)}
                  >
                    <Text style={[styles.catText, selected && styles.hobbyTextSelected]}>
                      {h.icon} {h.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.label}>
          {source === 'hobby'
            ? hobbyType === 'poetry'
              ? 'Poem title *'
              : hobbyType === 'singing' || hobbyType === 'music'
                ? 'Title / song name *'
                : hobbyType === 'reading'
                  ? 'Book / title *'
                  : 'Title *'
            : source === 'email'
              ? 'Title / Subject *'
              : 'Title *'}
        </Text>
        <TextInput
          style={[styles.input, coreReadOnly && styles.inputReadOnly]}
          placeholder={
            source === 'hobby' && hobbyType === 'poetry'
              ? 'e.g. Rain over Rainham'
              : source === 'hobby' && hobbyType === 'singing'
                ? 'e.g. Practice — soft ballad'
                : 'What happened?'
          }
          placeholderTextColor="#64748b"
          value={title}
          onChangeText={setTitle}
          editable={!coreReadOnly}
          autoFocus={!isEditing && !coreReadOnly}
        />

        {source === 'email' && (
          <>
            <Text style={styles.label}>From (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="sender@example.com"
              placeholderTextColor="#64748b"
              value={emailFrom}
              onChangeText={setEmailFrom}
              editable={!coreReadOnly}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </>
        )}

        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput
          style={[styles.input, coreReadOnly && styles.inputReadOnly]}
          placeholder="2026-08-23"
          placeholderTextColor="#64748b"
          value={date}
          onChangeText={setDate}
          editable={!coreReadOnly}
          keyboardType="numbers-and-punctuation"
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.categories}>
          {CATEGORIES.map((cat) => {
            const selected = category === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.catChip,
                  selected && { backgroundColor: cat.color + '33', borderColor: cat.color },
                ]}
                onPress={() => { if (!coreReadOnly) setCategory(cat.id); }}
              >
                <Text
                  style={[
                    styles.catText,
                    selected && { color: cat.color, fontWeight: '600' },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <LabelPicker value={labels} onChange={setLabels} editable={!coreReadOnly} />

        {isPoetry && (
          <>
            <Text style={styles.label}>Album / book name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Rainham Nights, Early Poems 2024"
              placeholderTextColor="#64748b"
              value={collectionName}
              onChangeText={setCollectionName}
            />

            <ImageAttachField
              label="Cover photo"
              uri={coverImageUri}
              onChange={(picked) => setCoverImageUri(picked && picked.uri ? picked.uri : '')}
              caption={coverPhotoNote}
              onCaptionChange={setCoverPhotoNote}
              captionPlaceholder="Optional cover caption"
              hint="Camera, gallery (Google Photos on Android), or a file."
            />

            <ImageAttachField
              label="Photo for this poem"
              uri={imageUri}
              onChange={(picked) => setImageUri(picked && picked.uri ? picked.uri : '')}
              caption={photoNote}
              onCaptionChange={setPhotoNote}
              captionPlaceholder="Optional caption"
            />
          </>
        )}

        {!isPoetry && (
          <ImageAttachField
            label="Photo"
            uri={imageUri}
            onChange={(picked) => setImageUri(picked && picked.uri ? picked.uri : '')}
            caption={photoNote}
            onCaptionChange={setPhotoNote}
            captionPlaceholder="Optional caption"
            hint="Camera, gallery (Google Photos on Android), or a file."
          />
        )}

        {source === 'hobby' && (hobbyType === 'singing' || hobbyType === 'music') && (
          <>
            <Text style={styles.label}>
              {hobbyType === 'singing' ? 'Singing file / recording note' : 'Audio / music file note'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. recording_2026-08-23.m4a  or  phone/Music/practice.mp3"
              placeholderTextColor="#64748b"
              value={audioNote}
              onChangeText={setAudioNote}
            />
            <Text style={styles.fieldHint}>
              Note the filename or path for now. Full file attach can be added next.
            </Text>
          </>
        )}

        {source === 'hobby' && hobbyType === 'reading' && (
          <>
            <Text style={styles.label}>Progress (chapter / page)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Chapter 4, page 87"
              placeholderTextColor="#64748b"
              value={readingProgress}
              onChangeText={setReadingProgress}
            />
          </>
        )}

        <Text style={styles.label}>Next action</Text>
        <View style={styles.categories}>
          {NEXT_ACTIONS.map((action) => {
            const selected = nextAction === action.id;
            return (
              <TouchableOpacity
                key={action.id}
                style={[styles.catChip, selected && styles.actionSelected]}
                onPress={() => { if (!coreReadOnly) setNextAction(action.id); }}
              >
                <Text style={[styles.catText, selected && styles.actionTextSelected]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>
          {source === 'hobby' && hobbyType === 'poetry'
            ? 'Poem text'
            : source === 'email'
              ? 'Email notes / snippet'
              : 'Description'}
        </Text>
        <TextInput
          style={[
            styles.input,
            styles.textArea,
            source === 'hobby' && hobbyType === 'poetry' && styles.poemArea,
            coreReadOnly && styles.inputReadOnly,
          ]}
          placeholder={descriptionPlaceholder()}
          placeholderTextColor="#64748b"
          value={description}
          onChangeText={setDescription}
          editable={!coreReadOnly}
          multiline
          numberOfLines={source === 'hobby' && hobbyType === 'poetry' ? 8 : 4}
          textAlignVertical="top"
        />

        {isInvitee ? (
          <>
            <Text style={styles.inviteeHint}>
              This is a shared event from a friend. Core fields are read-only — suggest a note for them to approve.
            </Text>
            <Text style={styles.label}>Suggest a note</Text>
                        <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. Also discussed next meeting date…"
              placeholderTextColor="#64748b"
              value={suggestionNote}
              onChangeText={setSuggestionNote}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!suggesting && !deleting}
              onFocus={() => {
                setTimeout(() => {
                  scrollRef.current?.scrollToEnd?.({ animated: true });
                }, 120);
              }}
            />
            <TouchableOpacity
              style={[styles.saveButton, (suggesting || deleting) && styles.saveDisabled]}
              onPress={handleSuggestNote}
              disabled={suggesting || deleting}
            >
              <Text style={styles.saveText}>{suggesting ? 'Sending…' : 'Submit suggestion'}</Text>
            </TouchableOpacity>
            {saveNotice ? <Text style={styles.saveNotice}>{saveNotice}</Text> : null}
            {isEditing && existing?.id ? (
              <TouchableOpacity
                style={[styles.deleteButton, (saving || deleting || suggesting) && styles.saveDisabled]}
                onPress={handleLeave}
                disabled={saving || deleting || suggesting}
              >
                <Text style={styles.deleteText}>{deleting ? 'Leaving...' : 'Leave event'}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.saveButton, (saving || deleting) && styles.saveDisabled]}
              onPress={handleSave}
              disabled={saving || deleting}
            >
              <Text style={styles.saveText}>
                {saving
                  ? 'Saving…'
                  : isEditing
                    ? 'Update'
                    : source === 'hobby'
                      ? 'Add hobby'
                      : 'Add Event'}
              </Text>
            </TouchableOpacity>
            {saveNotice ? <Text style={styles.saveNotice}>{saveNotice}</Text> : null}

            {isEditing && existing?.id ? (
              <TouchableOpacity
                style={styles.shareButton}
                onPress={() =>
                  navigation.navigate('ShareEvent', {
                    event: {
                      id: existing.id,
                      title: title.trim() || existing.title,
                      description: description.trim(),
                      date: existing.date,
                      category,
                      shareId: existing.shareId,
                      isShared: existing.isShared,
                    },
                  })
                }
              >
                <Text style={styles.shareText}>Share with a friend</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.shareHint}>
                Save the event first, then open it again to share a per-event invite code with a friend.
              </Text>
            )}

            {isEditing && existing?.id ? (
              <TouchableOpacity
                style={[styles.deleteButton, (saving || deleting) && styles.saveDisabled]}
                onPress={handleDelete}
                disabled={saving || deleting}
              >
                <Text style={styles.deleteText}>{deleting ? 'Deleting...' : 'Delete event'}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1024',
  },
  content: {
    padding: 20,
    paddingBottom: 160,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  friendSource: {
    color: '#34d399',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  saveNotice: {
    color: '#34d399',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  deleteButton: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#450a0a',
    alignItems: 'center',
  },
  deleteText: { color: '#fca5a5', fontSize: 16, fontWeight: '600' },
  intro: {
    color: '#a5b4fc',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  label: {
    color: '#c4b5fd',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 18,
    letterSpacing: 0.3,
  },
  fieldHint: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 6,
  },
  input: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3b0764',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#f8fafc',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  poemArea: {
    minHeight: 180,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sourceChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1a1b36',
    borderWidth: 1,
    borderColor: '#334155',
  },
  sourceSelected: {
    backgroundColor: '#3b0764',
    borderColor: '#8b5cf6',
  },
  sourceText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  sourceTextSelected: {
    color: '#c4b5fd',
    fontWeight: '600',
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1b36',
    borderWidth: 1,
    borderColor: '#334155',
  },
  catText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  hobbySelected: {
    backgroundColor: '#3b0764',
    borderColor: '#8b5cf6',
  },
  hobbyTextSelected: {
    color: '#c4b5fd',
    fontWeight: '600',
  },
  actionSelected: {
    backgroundColor: '#312e81',
    borderColor: '#3b82f6',
  },
  actionTextSelected: {
    color: '#60a5fa',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  shareButton: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  shareText: {
    color: '#c4b5fd',
    fontSize: 16,
    fontWeight: '600',
  },
  shareHint: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
    textAlign: 'center',
  },
  creatorNotices: { marginTop: 16, marginBottom: 4 },
  leftBanner: {
    backgroundColor: '#422006',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  leftBannerText: { color: '#fde68a', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  sugBanner: {
    backgroundColor: '#1e3a5f',
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  sugBannerText: { color: '#bfdbfe', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  noticeDismiss: { color: '#93c5fd', fontSize: 13, fontWeight: '600' },
  sugList: { marginBottom: 8 },
  sugListTitle: { color: '#c4b5fd', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  sugCard: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    marginBottom: 10,
  },
  sugFrom: { color: '#94a3b8', fontSize: 12, marginBottom: 6 },
  sugNote: { color: '#f8fafc', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  sugActions: { flexDirection: 'row', gap: 10 },
  sugApprove: {
    flex: 1,
    backgroundColor: '#166534',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sugApproveText: { color: '#bbf7d0', fontWeight: '700' },
  sugDecline: {
    flex: 1,
    backgroundColor: '#450a0a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  sugDeclineText: { color: '#fca5a5', fontWeight: '700' },
  sugDisabled: { opacity: 0.6 },
  inviteeHint: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    marginBottom: 4,
  },
  inputReadOnly: {
    opacity: 0.75,
  },
});
