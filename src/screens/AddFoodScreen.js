import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { saveEvent, deleteEvent } from '../services/eventService';
import ImageAttachField from '../components/ImageAttachField';
import { auth } from '../services/firebase';
import { useTheme } from '../themeContext';
import DateField from '../components/DateField';
import { keptClockLabel, localDayKey } from '../services/eventClock';
import { includeFoodOnList, looksLikeProse, splitIngredientList } from '../services/remakeList';
import { readHelloFreshLink } from '../services/helloFreshLink';

const FOOD_STATUSES = [
  { id: 'planned', label: 'Planned' },
  { id: 'eaten', label: 'Eaten' },
];

const MEAL_KITS = [
  { id: '', label: 'Not a box' },
  { id: 'hellofresh', label: 'Meal kit' },
  { id: 'other', label: 'Other box' },
];

function initialFoodFields(existing) {
  const items = String(existing?.foodItems || '').trim();
  const note = String(existing?.description || '').trim();
  const itemList = splitIngredientList(items);
  const noteIsList = !items && splitIngredientList(note).length > 0 && !looksLikeProse(note);
  if (itemList.length) {
    return { ingredients: items, note: note && note !== items ? note : '' };
  }
  if (noteIsList) return { ingredients: note, note: '' };
  return { ingredients: '', note: note || items };
}

function buildFoodTitle(foodStatus, foodItems, recipeName) {
  const recipe = String(recipeName || '').trim();
  if (recipe) return recipe;
  const items = String(foodItems || '').trim().replace(/\s+/g, ' ');
  const statusLabel = foodStatus === 'planned' ? 'Planned' : 'Eaten';
  if (!items) return `Food (${statusLabel.toLowerCase()})`;
  const short = items.length > 48 ? items.slice(0, 45).trim() + '…' : items;
  return `${statusLabel}: ${short}`;
}

export default function AddFoodScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const existing = route.params?.event || null;
  const isEditing = !!existing;
  const paramDate = route.params?.date
    ? String(route.params.date).slice(0, 10)
    : null;

  const startFields = initialFoodFields(existing);
  const [foodItems, setFoodItems] = useState(startFields.ingredients);
  const [note, setNote] = useState(startFields.note);
  const [date, setDate] = useState(
    existing?.date ? localDayKey(existing.date) : paramDate || new Date().toISOString().slice(0, 10)
  );
  const [foodStatus, setFoodStatus] = useState(
    existing?.foodStatus === 'planned' || existing?.foodStatus === 'eaten'
      ? existing.foodStatus
      : 'eaten'
  );
  const [imageUri, setImageUri] = useState(existing?.imageUri || '');
  const [imageRotation, setImageRotation] = useState(Number(existing?.imageRotation) || 0);
  const [mealKit, setMealKit] = useState(existing?.mealKit || '');
  const [recipeName, setRecipeName] = useState(existing?.recipeName || '');
  const [cardNumber, setCardNumber] = useState(existing?.cardNumber || '');
  const [cookMinutes, setCookMinutes] = useState(
    existing?.cookMinutes != null ? String(existing.cookMinutes) : ''
  );
  const [mealTags, setMealTags] = useState(existing?.mealTags || '');
  const [recipeUrl, setRecipeUrl] = useState(existing?.recipeUrl || '');
  const [saving, setSaving] = useState(false);
  const [readingLink, setReadingLink] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');

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
    setSaveNotice('');
    const items = foodItems.trim();
    const written = note.trim();
    if (!items && !written && !imageUri && !recipeName.trim()) {
      notify('Add something', 'Add ingredients, a note, a recipe name, or a photo.');
      return;
    }
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      notify('Invalid date', 'Please use the format YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      const title = buildFoodTitle(foodStatus, items, recipeName);
      await saveEvent({
        id: existing?.id,
        title,
        description: written || undefined,
        date: parsed.toISOString(),
        category: 'other',
        source: 'food',
        foodStatus,
        foodItems: items || undefined,
        imageUri: imageUri || undefined,
        imageRotation: Number(imageRotation) || 0,
        mealKit: mealKit || undefined,
        recipeName: recipeName.trim() || undefined,
        cardNumber: cardNumber.trim() || undefined,
        cookMinutes: cookMinutes.trim() || undefined,
        mealTags: mealTags.trim() || undefined,
        recipeUrl: recipeUrl.trim() || undefined,
        nextAction: 'none',
        shareId: existing?.shareId,
        isShared: existing?.isShared,
        sharedFrom: existing?.sharedFrom,
        sharedFromEmail: existing?.sharedFromEmail,
      });
      const notice = isEditing ? 'Updated.' : 'Saved.';
      setSaveNotice(notice);
      notify(isEditing ? 'Updated' : 'Saved', notice);
      navigation.goBack();
    } catch (e) {
      console.warn('AddFood save failed', e);
      const fail = e?.message || String(e) || 'Could not save. Please try again.';
      setSaveNotice(fail);
      notify('Error', fail);
    } finally {
      setSaving(false);
    }
  };

  const readLink = async () => {
    if (readingLink) return;
    setReadingLink(true);
    setSaveNotice('');
    try {
      const recipe = await readHelloFreshLink(recipeUrl);
      setMealKit('hellofresh');
      if (recipe.name) setRecipeName(recipe.name);
      if (recipe.minutes) setCookMinutes(recipe.minutes);
      if (recipe.tags) setMealTags(recipe.tags);
      setFoodItems(recipe.ingredients.join('\n'));
      setRecipeUrl(recipe.url);
      notify('Ingredients read', `${recipe.ingredients.length} foods, each on its own line. The method stays on HelloFresh.`);
    } catch (e) {
      notify('Could not read that link', e?.message || 'Try the recipe page itself.');
    } finally {
      setReadingLink(false);
    }
  };

  const openShoppingList = async () => {
    const items = foodItems.trim();
    const written = note.trim();
    if (!items && !written && !imageUri && !recipeName.trim() && !existing?.id) {
      notify('Add the meal first', 'Add ingredients or a recipe name, then remake it.');
      return;
    }
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      notify('Invalid date', 'Please use the format YYYY-MM-DD.');
      return;
    }
    try {
      const title = buildFoodTitle(foodStatus, items, recipeName);
      const saved = await saveEvent({
        id: existing?.id,
        title,
        description: written || undefined,
        date: parsed.toISOString(),
        category: 'other',
        source: 'food',
        foodStatus,
        foodItems: items || undefined,
        imageUri: imageUri || undefined,
        imageRotation: Number(imageRotation) || 0,
        mealKit: mealKit || undefined,
        recipeName: recipeName.trim() || undefined,
        cardNumber: cardNumber.trim() || undefined,
        cookMinutes: cookMinutes.trim() || undefined,
        mealTags: mealTags.trim() || undefined,
        recipeUrl: recipeUrl.trim() || undefined,
        nextAction: existing?.nextAction || 'none',
        shareId: existing?.shareId,
        isShared: existing?.isShared,
        sharedFrom: existing?.sharedFrom,
        sharedFromEmail: existing?.sharedFromEmail,
      });
      const id = existing?.id || (saved || []).find((row) => row.title === title && row.source === 'food')?.id;
      if (!id) throw new Error('The meal was not saved.');
      const mealId = await includeFoodOnList(id);
      navigation.navigate('ShoppingList', { mealId });
    } catch (e) {
      notify('Could not add the meal', e?.message || 'Try again.');
    }
  };

  const handleDelete = async () => {
    if (!existing?.id || saving || deleting) return;
    const ok = await confirmAction(
      'Delete food',
      'Delete this food entry? This removes it from this device'
        + (auth.currentUser ? ' and from your cloud copy.' : '.'),
      'Delete',
    );
    if (!ok) return;
    setDeleting(true);
    setSaveNotice('');
    try {
      await deleteEvent(existing.id);
      setSaveNotice('Deleted.');
      notify('Deleted', 'Food entry removed.');
      navigation.goBack();
    } catch (e) {
      const fail = e?.message || 'Could not delete. Please try again.';
      setSaveNotice(fail);
      notify('Could not delete', fail);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{isEditing ? 'Edit food' : 'Add food'}</Text>
        <Text style={styles.intro}>
          Photo-heavy meal note on your Timeline — not a calorie tracker.
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate('MealSkyline')}>
          <Text style={styles.skylineLink}>Meal skyline · five meal-kit cards open the map</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shopBtn} onPress={openShoppingList}>
          <Text style={styles.shopBtnText}>Shopping list — remake a meal</Text>
        </TouchableOpacity>

        <ImageAttachField
          label="Photo"
          uri={imageUri}
          turn={imageRotation}
          onChange={(picked) => {
            setImageUri(picked && picked.uri ? picked.uri : '');
            setImageRotation(picked && picked.rotation ? Number(picked.rotation) : 0);
          }}
          hint="Camera, gallery (Google Photos on Android), or a file."
        />

        <Text style={styles.label}>HelloFresh recipe link</Text>
        <TextInput
          style={styles.input}
          placeholder="https://www.hellofresh.co.uk/recipes/…"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          autoCorrect={false}
          value={recipeUrl}
          onChangeText={setRecipeUrl}
        />
        <TouchableOpacity style={[styles.shopBtn, readingLink && styles.saveDisabled]} onPress={readLink} disabled={readingLink}>
          <Text style={styles.shopBtnText}>{readingLink ? 'Reading the page…' : 'Read ingredients from this link'}</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          Each food on that public recipe page becomes its own line. A meal note is not split. The cooking method stays on HelloFresh.
        </Text>

        <Text style={styles.label}>Ingredients</Text>
        <Text style={styles.hint}>One ingredient on each new line. A comma stays on that line and does not start another food.</Text>
        <TextInput
          style={[styles.input, styles.items]}
          placeholder={'One food on each line\nChicken thigh\nEgg noodles'}
          placeholderTextColor="#64748b"
          value={foodItems}
          onChangeText={setFoodItems}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Note</Text>
        <TextInput
          style={[styles.input, styles.items]}
          placeholder="Optional. A sentence stays a note and is not turned into foods."
          placeholderTextColor="#64748b"
          value={note}
          onChangeText={setNote}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Date</Text>
        <DateField value={date} onChange={setDate} />
        {keptClockLabel(existing?.date) ? (
          <Text style={styles.hint}>Time kept: {keptClockLabel(existing.date)}. Saving again does not clear it.</Text>
        ) : null}

        <Text style={styles.label}>Status</Text>
        <View style={styles.row}>
          {FOOD_STATUSES.map((s) => {
            const on = foodStatus === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setFoodStatus(s.id)}
              >
                <Text style={[styles.chipText, on && styles.chipOnText]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Meal-kit card</Text>
        <View style={styles.row}>
          {MEAL_KITS.map((kit) => {
            const on = mealKit === kit.id;
            return (
              <TouchableOpacity
                key={kit.id || 'none'}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setMealKit(kit.id)}
              >
                <Text style={[styles.chipText, on && styles.chipOnText]}>{kit.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Your own photo and the name you type. Timeline is not part of the box company.
          The paid map does not use their logo or their recipe text. A link to their page is fine.
        </Text>
        {mealKit ? (
          <>
            <Text style={styles.label}>Recipe name</Text>
            <TextInput
              style={styles.input}
              placeholder="What you call this meal"
              placeholderTextColor="#64748b"
              value={recipeName}
              onChangeText={setRecipeName}
            />
            <Text style={styles.label}>Card number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 42"
              placeholderTextColor="#64748b"
              value={cardNumber}
              onChangeText={setCardNumber}
            />
            <Text style={styles.label}>Cooking time (minutes)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 25"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
              value={cookMinutes}
              onChangeText={setCookMinutes}
            />
            <Text style={styles.label}>Tags</Text>
            <TextInput
              style={styles.input}
              placeholder="High Protein, Veggie"
              placeholderTextColor="#64748b"
              value={mealTags}
              onChangeText={setMealTags}
            />
          </>
        ) : null}

        {!!saveNotice && <Text style={styles.notice}>{saveNotice}</Text>}

        <TouchableOpacity
          style={[styles.save, (saving || deleting) && styles.saveDisabled]}
          onPress={handleSave}
          disabled={saving || deleting}
        >
          <Text style={styles.saveText}>
            {saving ? 'Saving…' : isEditing ? 'Update food' : 'Save food'}
          </Text>
        </TouchableOpacity>

        {isEditing ? (
          <TouchableOpacity
            style={[styles.deleteBtn, (saving || deleting) && styles.saveDisabled]}
            onPress={handleDelete}
            disabled={saving || deleting}
          >
            <Text style={styles.deleteText}>{deleting ? 'Deleting…' : 'Delete'}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  content: { padding: 20, paddingBottom: 40 },
  heading: { color: c.text, fontSize: 22, fontWeight: '700', marginBottom: 6 },
  intro: { color: c.faint, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  hint: { color: c.faint, fontSize: 12, lineHeight: 17, marginTop: 8 },
  skylineLink: { color: '#e7a06a', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  shopBtn: {
    backgroundColor: c.blue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  shopBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  label: { color: c.faint, fontSize: 14, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: c.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: c.text,
  },
  items: { minHeight: 100 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipText: { color: c.faint, fontSize: 14, fontWeight: '600' },
  chipOn: { borderColor: '#22c55e', backgroundColor: '#14532d' },
  chipOnText: { color: '#86efac' },
  notice: { color: c.faint, marginTop: 16, fontSize: 14 },
  save: {
    backgroundColor: c.blue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  deleteBtn: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#450a0a',
  },
  deleteText: { color: '#fca5a5', fontSize: 16, fontWeight: '600' },
});
}

