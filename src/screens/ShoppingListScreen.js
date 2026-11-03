import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { readHelloFreshLink } from '../services/helloFreshLink';
import { getEvents, saveEvent } from '../services/eventService';
import { copyTextToClipboard } from '../services/shareService';
import DateField from '../components/DateField';
import { saveShoppingHandoff } from '../services/shoppingHandoff';
import {
  clearShoppingList,
  handoffPayload,
  pastRecipeCards,
  restoreArchive,
} from '../services/shoppingPlan';
import { useTheme } from '../themeContext';
import {
  REMAKE_PERK_CREDITS,
  SHOPS,
  UBER_STORES,
  buildLines,
  displayName,
  formatPence,
  lineCost,
  listText,
  loadRemakeState,
  paidFor,
  poundsToPence,
  recipeFromItems,
  saveRemakeState,
  shopSearchUrl,
  splitIngredientList,
  uberFindStoreUrl,
  uberStoreUrl,
  includeFoodOnList,
  visibleRecipes,
} from '../services/remakeList';

export default function ShoppingListScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const [events, setEvents] = useState([]);
  const [state, setState] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftItems, setDraftItems] = useState('');
  const [draftPaid, setDraftPaid] = useState('');
  const [draftBox, setDraftBox] = useState(false);
  const [itemDrafts, setItemDrafts] = useState({});
  const [hfLink, setHfLink] = useState('');
  const [readingLink, setReadingLink] = useState(false);
  const [uberDraft, setUberDraft] = useState('');
  const [priceDrafts, setPriceDrafts] = useState({});
  const [swapFor, setSwapFor] = useState(null);
  const [swapDraft, setSwapDraft] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [group, setGroup] = useState('meal');
  const [sharing, setSharing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState({});
  const [planDate, setPlanDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recipePage, setRecipePage] = useState(1);
  const [planning, setPlanning] = useState(false);
  const [botMode, setBotMode] = useState('all');
  const [substitutions, setSubstitutions] = useState('ask');
  const [exceptions, setExceptions] = useState('');
  const [capPounds, setCapPounds] = useState('');
  const [allowedShops, setAllowedShops] = useState({});
  const [optedIn, setOptedIn] = useState(false);
  const [handing, setHanding] = useState(false);
  const focusMealId = route?.params?.mealId || '';

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [saved, list] = await Promise.all([
          loadRemakeState(),
          getEvents().catch(() => []),
        ]);
        if (cancelled) return;
        setState(saved);
        setEvents(Array.isArray(list) ? list : []);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const persist = (next) => {
    setState(next);
    saveRemakeState(next).catch(() => {});
  };

  const recipes = useMemo(() => (state ? visibleRecipes(events, state) : []), [events, state]);
  const lines = useMemo(() => (state ? buildLines(recipes, state) : []), [recipes, state]);
  const shop = state?.shop && SHOPS.some((s) => s.id === state.shop) ? state.shop : 'tesco';
  const shopLabel = SHOPS.find((s) => s.id === shop)?.label || 'Shop';

  const totals = useMemo(() => {
    if (!state) return { box: 0, shopPence: 0, otherPence: 0, saved: 0, missingBox: false, boxMeals: 0, otherMeals: 0 };
    const chosen = recipes.filter((r) => !state.selected || state.selected.includes(r.id));
    const boxes = chosen.filter((r) => r.isBox);
    const others = chosen.filter((r) => !r.isBox);
    const boxIds = new Set(boxes.map((r) => r.id));
    const box = boxes.reduce((sum, r) => sum + paidFor(r, state), 0);
    const shopPence = lines.filter((line) => boxIds.has(line.mealId)).reduce((sum, line) => sum + lineCost(line), 0);
    const otherPence = lines.filter((line) => !boxIds.has(line.mealId)).reduce((sum, line) => sum + lineCost(line), 0);
    return {
      box,
      shopPence,
      otherPence,
      saved: box - shopPence,
      missingBox: boxes.some((r) => !paidFor(r, state)),
      boxMeals: boxes.length,
      otherMeals: others.length,
    };
  }, [recipes, lines, state]);

  if (!state) {
    return (
      <View style={styles.container}>
        <Text style={styles.intro}>Loading shopping list…</Text>
      </View>
    );
  }

  const selectedOn = (id) => !state.selected || state.selected.includes(id);
  const past = pastRecipeCards(events);
  const pastPage = past.slice(0, recipePage * 6);

  function toggleMeal(id) {
    const current = recipes.filter((r) => selectedOn(r.id)).map((r) => r.id);
    const nextIds = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    persist({ ...state, selected: nextIds });
  }

  function patch(partial) {
    persist({ ...state, ...partial });
  }

  function setPaid(id, raw) {
    persist({ ...state, paid: { ...state.paid, [id]: poundsToPence(raw) } });
  }

  function setPrice(line, raw) {
    const checked = { ...(state.checked || {}), [line.id]: false };
    persist({ ...state, prices: { ...state.prices, [line.id]: poundsToPence(raw) }, checked });
  }

  function setGot(line) {
    persist({ ...state, got: { ...state.got, [line.id]: !line.got } });
  }

  function setGotLines(groupLines) {
    const got = { ...(state.got || {}) };
    const open = groupLines.filter((line) => !line.dropped);
    const allIn = open.length > 0 && open.every((line) => line.got);
    open.forEach((line) => {
      got[line.id] = !allIn;
    });
    persist({ ...state, got });
  }

  function setDropped(line) {
    persist({
      ...state,
      dropped: { ...state.dropped, [line.id]: !line.dropped },
      got: { ...state.got, [line.id]: false },
    });
  }

  function applySwap(line) {
    persist({ ...state, swaps: { ...state.swaps, [line.id]: swapDraft.trim() }, dropped: { ...state.dropped, [line.id]: false } });
    setSwapFor(null);
    setSwapDraft('');
  }

  function removeRecipe(recipe) {
    const hidden = [...(state.hidden || []), recipe.id];
    const extras = (state.extras || []).filter((r) => r.id !== recipe.id);
    const selected = state.selected ? state.selected.filter((id) => id !== recipe.id) : null;
    persist({ ...state, hidden, extras, selected });
  }

  function addCard() {
    const name = draftName.trim();
    const items = draftItems.trim();
    if (!name || !items) {
      Alert.alert('Add a meal', 'Add a meal name and at least one ingredient.');
      return;
    }
    if (!splitIngredientList(items).length) {
      Alert.alert(
        'Ingredients',
        'Put one food on each line, or separate them with commas. A sentence is kept as a note and is not turned into shop lines.',
      );
      return;
    }
    const id = `card-${Date.now()}`;
    const card = recipeFromItems(name, items, id, draftBox ? 'Your box' : 'Your list', draftBox);
    const paid = draftBox ? { ...state.paid, [id]: poundsToPence(draftPaid) } : state.paid;
    const current = recipes.filter((r) => selectedOn(r.id)).map((r) => r.id);
    persist({
      ...state,
      extras: [card, ...(state.extras || [])],
      paid,
      selected: [...current, id],
    });
    setDraftName('');
    setDraftPaid('');
    setDraftItems('');
    setDraftBox(false);
    setAdding(false);
  }

  async function addPastRecipes() {
    const chosen = past.filter((recipe) => picked[recipe.key]);
    if (!chosen.length) {
      Alert.alert('Pick a recipe', 'Choose at least one past recipe.');
      return;
    }
    setPlanning(true);
    try {
      const day = planDate || new Date().toISOString().slice(0, 10);
      const parsed = new Date(`${day}T12:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        Alert.alert('Pick a date', 'Choose the day you plan to cook.');
        return;
      }
      for (const recipe of chosen) {
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        await saveEvent({
          id,
          title: recipe.name,
          recipeName: recipe.name,
          foodItems: recipe.items,
          description: recipe.when ? `Planned again. Last cooked ${String(recipe.when).slice(0, 10)}.` : 'Planned again.',
          date: parsed.toISOString(),
          category: 'other',
          source: 'food',
          mealKit: recipe.isBox || undefined,
          nextAction: 'none',
        });
        await includeFoodOnList(id);
      }
      const [saved, list] = await Promise.all([loadRemakeState(), getEvents().catch(() => events)]);
      setState(saved);
      setEvents(Array.isArray(list) ? list : events);
      setPicked({});
      setPickerOpen(false);
      Alert.alert('Added', `${chosen.length} planned meal${chosen.length === 1 ? '' : 's'}. The old meals were not changed.`);
    } catch (e) {
      Alert.alert('Could not add', e?.message || 'Try again.');
    } finally {
      setPlanning(false);
    }
  }

  function confirmClear() {
    Alert.alert(
      'Clear the shopping list?',
      'The meals stay on your timeline. This list is kept so you can put it back.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear list',
          style: 'destructive',
          onPress: () => persist(clearShoppingList(state, recipes)),
        },
      ]
    );
  }

  async function handToBot() {
    setHanding(true);
    try {
      const payload = handoffPayload({
        mode: botMode,
        shop,
        substitutions,
        exceptions,
        capPounds,
        allowedShops: SHOPS.filter((item) => allowedShops[item.id]).map((item) => item.label),
        optedIn,
        lines,
      });
      await saveShoppingHandoff(payload);
      await copyTextToClipboard(listText(recipes, lines, shop, state));
      Alert.alert(
        'List ready for your Grok Bot',
        'The list is copied, and saved for GET /shopping. Timeline will not pay or check out.'
      );
    } catch (e) {
      Alert.alert('Not handed over', e?.message || 'Try again.');
    } finally {
      setHanding(false);
    }
  }

  async function saveIngredients(recipe) {
    const text = String(itemDrafts[recipe.id] || '').trim();
    const names = splitIngredientList(text);
    if (!names.length) {
      const message = 'Put one food on each line, or separate them with commas. A sentence stays as a note.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('Ingredients', message);
      return;
    }
    const listed = names.join('\n');
    if (recipe.eventId) {
      try {
        await saveEvent({ id: recipe.eventId, foodItems: listed, source: 'food' });
        setEvents(await getEvents());
      } catch (e) {
        Alert.alert('Could not save', e?.message || 'The ingredients stayed on this screen only.');
      }
      return;
    }
    const card = recipeFromItems(recipe.name, listed, recipe.id, recipe.kit, recipe.isBox);
    const extras = (state.extras || []).map((row) => (row.id === recipe.id ? { ...row, ...card } : row));
    persist({ ...state, extras });
  }

  async function addFromHelloFresh() {
    if (readingLink) return;
    setReadingLink(true);
    try {
      const recipe = await readHelloFreshLink(hfLink);
      const id = `hf-${Date.now()}`;
      const card = recipeFromItems(recipe.name, recipe.ingredients.join('\n'), id, 'HelloFresh link', true);
      if (!card.ingredients.length) {
        throw new Error('The foods on that page could not be split into lines.');
      }
      const current = recipes.filter((r) => selectedOn(r.id)).map((r) => r.id);
      persist({
        ...state,
        extras: [{ ...card, recipeUrl: recipe.url }, ...(state.extras || [])],
        selected: [...current, id],
      });
      setHfLink('');
      const message = `${recipe.ingredients.length} foods from the HelloFresh page, each on its own line.`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('Ingredients read', message);
    } catch (e) {
      const message = e?.message || 'Try the recipe page itself.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('Could not read that link', message);
    } finally {
      setReadingLink(false);
    }
  }

  async function copyItem(line) {
    const text = displayName(line);
    const ok = await copyTextToClipboard(text);
    if (!ok) {
      const message = 'Could not copy from this device.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('Copy', message);
      return;
    }
    setCopiedId(line.id);
    setTimeout(() => setCopiedId((current) => (current === line.id ? '' : current)), 1500);
  }

  async function copyList() {
    const text = listText(recipes, lines, shop, state);
    const ok = await copyTextToClipboard(text);
    const message = ok
      ? 'List copied. Paste it into a note or Timeline Bot. Do not paste a card number.'
      : 'Could not copy from this device.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
    else Alert.alert(ok ? 'Copied' : 'Copy', message);
  }

  async function shareWithFriend() {
    if (sharing) return;
    const text = listText(recipes, lines, shop, state);
    if (!lines.length) {
      const message = 'Add a meal before sharing the list with a friend.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('Nothing to share', message);
      return;
    }
    setSharing(true);
    try {
      const id = state.shareEventId || `shop-list-${Date.now().toString(36)}`;
      const saved = await saveEvent({
        id,
        title: 'Shopping list',
        description: text,
        date: new Date().toISOString(),
        category: 'personal',
        source: 'manual',
        shareId: state.shareId || undefined,
        isShared: !!state.shareId,
      });
      const event = (saved || []).find((row) => row.id === id) || {
        id,
        title: 'Shopping list',
        description: text,
        date: new Date().toISOString(),
        category: 'personal',
        source: 'manual',
        shareId: state.shareId,
        isShared: !!state.shareId,
      };
      persist({ ...state, shareEventId: id, shareId: event.shareId || state.shareId || null });
      navigation.navigate('ShareEvent', { event });
    } catch (e) {
      const message = e?.message || 'Sign in, then try again.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('Could not share', message);
    } finally {
      setSharing(false);
    }
  }

  function openShopFor(query) {
    if (shop === 'uber' && !uberStoreUrl(state.uberStore && state.uberStore.url)) {
      const message = 'Pick the Uber Eats store first, then paste its page link. Item search stays in that shop.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('Choose a store', message);
      return;
    }
    const url = shopSearchUrl(shop, query || shopLabel, state.uberStore);
    if (!url) return;
    Linking.openURL(url).catch(() => {
      Alert.alert('Could not open the shop', 'Copy the item and open the shop yourself.');
    });
  }

  function openNext() {
    const next = lines.find((line) => !line.got && !line.dropped);
    openShopFor(next ? displayName(next) : shopLabel);
  }

  function openItem(line) {
    openShopFor(displayName(line));
  }

  function saveUberStore() {
    const url = uberStoreUrl(uberDraft);
    if (!url) {
      const message = 'Paste the store page itself, the one with /store/ in the link. A search page still jumps between shops.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('Store link', message);
      return;
    }
    persist({ ...state, shop: 'uber', uberStore: { label: (state.uberStore && state.uberStore.label) || 'Saved store', url } });
  }

  function collectPrices() {
    const prices = { ...(state.prices || {}) };
    Object.keys(priceDrafts).forEach((id) => {
      const raw = priceDrafts[id];
      if (raw == null || String(raw).trim() === '') return;
      prices[id] = poundsToPence(raw);
    });
    return prices;
  }

  function savePrices(markChecked) {
    const prices = collectPrices();
    const checked = { ...(state.checked || {}) };
    let counted = 0;
    let total = 0;
    let waiting = 0;
    lines.forEach((line) => {
      if (line.dropped) return;
      const typed = priceDrafts[line.id] != null && String(priceDrafts[line.id]).trim() !== '';
      if (prices[line.id] == null) {
        waiting += 1;
        if (markChecked) checked[line.id] = false;
        return;
      }
      if (markChecked) {
        checked[line.id] = true;
        counted += 1;
        total += prices[line.id];
      } else if (typed) {
        checked[line.id] = false;
      }
    });
    persist({ ...state, prices, checked });
    setPriceDrafts({});
    const message = markChecked
      ? waiting
        ? `${formatPence(total)} from ${counted} checked price${counted === 1 ? '' : 's'}. ${waiting} still estimated and left out of the total.`
        : `${formatPence(total)} from ${counted} item${counted === 1 ? '' : 's'}. Those prices are no longer estimates.`
      : 'Prices saved on this device. You can come back and shop later.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
    else Alert.alert(markChecked ? 'Prices checked' : 'Saved', message);
  }

  function markPricesChecked() {
    savePrices(true);
  }

  const basket = [];
  const seen = new Map();
  lines.forEach((line) => {
    const key = displayName(line).toLowerCase();
    if (!seen.has(key)) {
      const groupLines = [];
      seen.set(key, groupLines);
      basket.push(groupLines);
    }
    seen.get(key).push(line);
  });

  function renderMeal(recipe) {
    const on = selectedOn(recipe.id);
    const paid = paidFor(recipe, state);
    return (
      <View key={recipe.id} style={styles.card}>
        <View style={styles.rowBetween}>
          <TouchableOpacity style={[styles.toggle, on && styles.toggleOn]} onPress={() => toggleMeal(recipe.id)}>
            <Text style={[styles.toggleText, on && styles.toggleOnText]}>{on ? 'On' : 'Off'}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.mealName}>{recipe.name}</Text>
            <Text style={styles.meta}>{recipe.kit}{recipe.example ? ' · example' : ''}</Text>
          </View>
          <TouchableOpacity onPress={() => removeRecipe(recipe)}>
            <Text style={styles.meta}>Remove</Text>
          </TouchableOpacity>
        </View>
        {recipe.isBox ? (
          <>
            <Text style={styles.label}>Paid for the box (£)</Text>
            <TextInput
              style={styles.input}
              defaultValue={(paid / 100).toFixed(2)}
              key={`${recipe.id}-${paid}`}
              onEndEditing={(e) => setPaid(recipe.id, e.nativeEvent.text)}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.faint}
            />
          </>
        ) : null}
        {recipe.ingredients.length ? (
          <View style={styles.row}>
            {recipe.ingredients.map((item) => (
              <View key={item.id} style={styles.chip}>
                <Text style={styles.chipText}>{item.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <>
            <Text style={styles.intro}>
              {recipe.note
                ? 'This is a note, so it was not split into foods.'
                : 'No ingredient list on this meal yet.'}
            </Text>
            {recipe.note ? <Text style={styles.note}>{recipe.note}</Text> : null}
            <Text style={styles.label}>Ingredients, one per line</Text>
            <TextInput
              style={[styles.input, styles.items]}
              value={itemDrafts[recipe.id] || ''}
              onChangeText={(value) => setItemDrafts((prev) => ({ ...prev, [recipe.id]: value }))}
              placeholder={'Chicken breast\nLemon\nRice'}
              placeholderTextColor={colors.faint}
              multiline
            />
            <TouchableOpacity style={styles.smallBtn} onPress={() => saveIngredients(recipe)}>
              <Text style={styles.smallBtnText}>Use these ingredients</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Shopping list</Text>
      <Text style={styles.intro}>
        Remake a past meal without the box. Every line stays on its own meal, so a swap in the aisle still belongs to that plate.
      </Text>

      <View style={styles.card}>
        <TouchableOpacity style={styles.primary} onPress={() => setPickerOpen((open) => !open)}>
          <Text style={styles.primaryText}>{pickerOpen ? 'Close past recipes' : 'Add recipe from previous events'}</Text>
        </TouchableOpacity>
        {pickerOpen ? (
          <>
            <Text style={styles.intro}>Newest first. Repeated names are shown once, on the last cooked date. The old event is not changed.</Text>
            <Text style={styles.label}>Plan to cook on</Text>
            <DateField value={planDate} onChange={setPlanDate} />
            {past.length === 0 ? (
              <Text style={styles.intro}>No food events on this phone yet.</Text>
            ) : pastPage.map((recipe) => {
              const on = !!picked[recipe.key];
              return (
                <TouchableOpacity
                  key={recipe.key}
                  style={[styles.chip, on && styles.chipOn, { marginTop: 8 }]}
                  onPress={() => setPicked((cur) => ({ ...cur, [recipe.key]: !cur[recipe.key] }))}
                >
                  <Text style={[styles.chipText, on && styles.chipOnText]}>
                    {on ? '✓ ' : ''}{recipe.name} · last {String(recipe.when || '').slice(0, 10) || 'date not set'}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {past.length > pastPage.length ? (
              <TouchableOpacity style={styles.smallBtn} onPress={() => setRecipePage((n) => n + 1)}>
                <Text style={styles.smallBtnText}>Show more</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.primary} onPress={addPastRecipes} disabled={planning}>
              <Text style={styles.primaryText}>{planning ? 'Adding…' : 'Add selected as new meals'}</Text>
            </TouchableOpacity>
          </>
        ) : null}
        <TouchableOpacity style={styles.smallBtn} onPress={confirmClear}>
          <Text style={styles.smallBtnText}>Clear all recipes</Text>
        </TouchableOpacity>
        {(state.archives || []).map((archive) => (
          <TouchableOpacity key={archive.id} style={styles.smallBtn} onPress={() => persist(restoreArchive(state, archive.id))}>
            <Text style={styles.smallBtnText}>Put back {archive.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Ask my Grok Bot</Text>
        <Text style={styles.intro}>Hands over this list. Timeline does not pay, and it does not check out.</Text>
        {[
          ['one', 'One by one'],
          ['all', 'All, then feedback'],
          ['order', 'Just order it'],
        ].map(([id, label]) => (
          <TouchableOpacity key={id} style={[styles.chip, botMode === id && styles.chipOn, { marginTop: 6 }]} onPress={() => setBotMode(id)}>
            <Text style={[styles.chipText, botMode === id && styles.chipOnText]}>{label}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.label}>If an item is missing</Text>
        <View style={styles.row}>
          {[
            ['ask', 'Ask me'],
            ['allow', 'Allow a swap'],
            ['skip', 'Skip it'],
          ].map(([id, label]) => (
            <TouchableOpacity key={id} style={[styles.chip, substitutions === id && styles.chipOn]} onPress={() => setSubstitutions(id)}>
              <Text style={[styles.chipText, substitutions === id && styles.chipOnText]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={exceptions}
          onChangeText={setExceptions}
          placeholder="Exceptions, such as lactose-free milk"
          placeholderTextColor={colors.faint}
        />
        {botMode === 'order' ? (
          <>
            <Text style={styles.intro}>This can spend money. Set a cap, the shops that are allowed, and tick the box. The bot must stop if the bank asks for a code.</Text>
            <Text style={styles.label}>Spending cap (£)</Text>
            <TextInput style={styles.input} value={capPounds} onChangeText={setCapPounds} placeholder="25" placeholderTextColor={colors.faint} keyboardType="decimal-pad" />
            <View style={styles.row}>
              {SHOPS.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.chip, allowedShops[item.id] && styles.chipOn]}
                  onPress={() => setAllowedShops((cur) => ({ ...cur, [item.id]: !cur[item.id] }))}
                >
                  <Text style={[styles.chipText, allowedShops[item.id] && styles.chipOnText]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.chip, optedIn && styles.chipOn]} onPress={() => setOptedIn((on) => !on)}>
              <Text style={[styles.chipText, optedIn && styles.chipOnText]}>{optedIn ? '✓ I allow this order' : 'I allow this order'}</Text>
            </TouchableOpacity>
          </>
        ) : null}
        <TouchableOpacity style={styles.primary} onPress={handToBot} disabled={handing}>
          <Text style={styles.primaryText}>{handing ? 'Saving…' : 'Hand this list to my Grok Bot'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>HelloFresh recipe link</Text>
        <TextInput
          style={styles.input}
          value={hfLink}
          onChangeText={setHfLink}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://www.hellofresh.co.uk/recipes/…"
          placeholderTextColor={colors.faint}
        />
        <TouchableOpacity style={styles.primary} onPress={addFromHelloFresh} disabled={readingLink}>
          <Text style={styles.primaryText}>{readingLink ? 'Reading the page…' : 'Use the foods on this page'}</Text>
        </TouchableOpacity>
        <Text style={styles.intro}>
          Each ingredient on that page becomes its own shop line. A meal note is not split. The cooking method stays on HelloFresh.
        </Text>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Box versus the shop</Text>
        <Text style={styles.summaryValue}>
          {totals.boxMeals === 0
            ? 'No box meals on this list'
            : totals.missingBox
              ? 'Add the box price'
              : totals.saved > 0
                ? `${formatPence(totals.saved)} less than the box`
                : 'Shop guide is not under the box'}
        </Text>
        <Text style={styles.intro}>
          {totals.boxMeals} box meal{totals.boxMeals === 1 ? '' : 's'} · box {formatPence(totals.box)} · shop guide {formatPence(totals.shopPence)}
        </Text>
        {totals.otherMeals ? (
          <Text style={styles.intro}>
            {totals.otherMeals} other meal{totals.otherMeals === 1 ? '' : 's'} · shop guide {formatPence(totals.otherPence)}. Not counted as a box.
          </Text>
        ) : null}
        <Text style={styles.intro}>
          {totals.boxMeals === 0
            ? 'The box comparison only includes meals saved as a meal-kit card. '
            : totals.saved > 0
              ? `Meal extras are ${REMAKE_PERK_CREDITS} credits once that perk is on. You are ahead if those ${REMAKE_PERK_CREDITS} credits cost less than ${formatPence(totals.saved)}. `
              : 'Type what you paid for each box to compare it with the shop guide. '}
          Guide prices are typical supermarket figures, not a live till.
        </Text>
      </View>

      {focusMealId ? (
        <Text style={styles.intro}>
          {recipes.some((recipe) => recipe.id === focusMealId)
            ? `${recipes.find((recipe) => recipe.id === focusMealId)?.name || 'This meal'} is on this list and switched on.`
            : 'That meal was saved, but it has no foods to shop for yet. Put one ingredient on each line, then press the button again.'}
        </Text>
      ) : null}

      <View style={styles.rowBetween}>
        <Text style={styles.section}>Meals</Text>
        <TouchableOpacity style={styles.smallBtn} onPress={() => setAdding((v) => !v)}>
          <Text style={styles.smallBtnText}>{adding ? 'Close' : 'Add a card'}</Text>
        </TouchableOpacity>
      </View>

      {adding ? (
        <View style={styles.card}>
          <Text style={styles.label}>Meal name</Text>
          <TextInput style={styles.input} value={draftName} onChangeText={setDraftName} placeholder="Lemon chicken tray" placeholderTextColor={colors.faint} />
          <Text style={styles.label}>Ingredients, one per line</Text>
          <TextInput style={[styles.input, styles.items]} value={draftItems} onChangeText={setDraftItems} placeholder={'Chicken breast\nLemon\nRice'} placeholderTextColor={colors.faint} multiline />
          <Text style={styles.intro}>Each new line is one ingredient. A comma stays on that line.</Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.chip, !draftBox && styles.chipOn]} onPress={() => setDraftBox(false)}>
              <Text style={[styles.chipText, !draftBox && styles.chipOnText]}>Just ingredients</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, draftBox && styles.chipOn]} onPress={() => setDraftBox(true)}>
              <Text style={[styles.chipText, draftBox && styles.chipOnText]}>Meal-kit box</Text>
            </TouchableOpacity>
          </View>
          {draftBox ? (
            <>
              <Text style={styles.label}>What you paid for the box (£)</Text>
              <TextInput style={styles.input} value={draftPaid} onChangeText={setDraftPaid} placeholder="13.99" placeholderTextColor={colors.faint} keyboardType="decimal-pad" />
            </>
          ) : null}
          <TouchableOpacity style={styles.primary} onPress={addCard}>
            <Text style={styles.primaryText}>Add to the list</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.section}>Box meals</Text>
      <Text style={styles.intro}>Only meals saved as a meal-kit card. These are the ones compared with what you paid for the box.</Text>
      {recipes.some((r) => r.isBox) ? recipes.filter((r) => r.isBox).map((recipe) => renderMeal(recipe)) : (
        <Text style={styles.intro}>None yet. On Add food, choose Meal kit before you save.</Text>
      )}

      <Text style={styles.section}>Other meals</Text>
      <Text style={styles.intro}>Reorder the ingredients if you want. These stay off the box comparison.</Text>
      {recipes.some((r) => !r.isBox) ? recipes.filter((r) => !r.isBox).map((recipe) => renderMeal(recipe)) : (
        <Text style={styles.intro}>No other food events on the list.</Text>
      )}

      <View style={styles.rowBetween}>
        <Text style={styles.section}>This shop</Text>
        <View style={styles.row}>
          {[['meal', 'By meal'], ['basket', 'One basket']].map(([id, label]) => (
            <TouchableOpacity key={id} style={[styles.chip, group === id && styles.chipOn]} onPress={() => setGroup(id)}>
              <Text style={[styles.chipText, group === id && styles.chipOnText]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Text style={styles.intro}>Preferred shop. You still pay in their app or at the till.</Text>
      <View style={styles.row}>
        {SHOPS.map((item) => (
          <TouchableOpacity key={item.id} style={[styles.chip, shop === item.id && styles.chipOn]} onPress={() => patch({ shop: item.id })}>
            <Text style={[styles.chipText, shop === item.id && styles.chipOnText]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {shop === 'uber' ? (
        <View style={styles.card}>
          <Text style={styles.label}>Uber Eats store</Text>
          <Text style={styles.intro}>Choose the shop first. The next item is searched inside that store, not across every shop.</Text>
          <View style={styles.row}>
            {UBER_STORES.map((store) => {
              const on = (state.uberStore && state.uberStore.label) === store.label;
              return (
                <TouchableOpacity
                  key={store.id}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => persist({ ...state, shop: 'uber', uberStore: { label: store.label, url: state.uberStore && state.uberStore.label === store.label ? state.uberStore.url : '' } })}
                >
                  <Text style={[styles.chipText, on && styles.chipOnText]}>{store.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.smallBtn}
            onPress={() => Linking.openURL(uberFindStoreUrl((state.uberStore && state.uberStore.label) || 'Tesco Express'))}
          >
            <Text style={styles.smallBtnText}>Find {(state.uberStore && state.uberStore.label) || 'Tesco Express'}</Text>
          </TouchableOpacity>
          <Text style={styles.label}>Paste that store’s page</Text>
          <TextInput
            style={styles.input}
            value={uberDraft}
            onChangeText={setUberDraft}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://www.ubereats.com/gb/store/…"
            placeholderTextColor={colors.faint}
          />
          <TouchableOpacity style={styles.smallBtn} onPress={saveUberStore}>
            <Text style={styles.smallBtnText}>Save this store</Text>
          </TouchableOpacity>
          <Text style={styles.intro}>
            {uberStoreUrl(state.uberStore && state.uberStore.url)
              ? `Item search stays in ${state.uberStore.label || 'this store'}.`
              : 'Item search waits until the store page is saved. A general Uber Eats search jumps to a different shop each time.'}
          </Text>
        </View>
      ) : null}

      {lines.length === 0 ? <Text style={styles.intro}>Turn a meal on to build the list.</Text> : (
        <Text style={styles.intro}>
          {lines.filter((line) => !line.dropped && line.got).length} of {lines.filter((line) => !line.dropped).length} in the basket. Tick each one as you add it.
        </Text>
      )}

      {group === 'meal'
        ? recipes.filter((r) => selectedOn(r.id)).map((recipe) => (
            <View key={recipe.id}>
              <Text style={styles.mealHead}>{recipe.name}{recipe.isBox ? '' : ' · not a box'}</Text>
              {lines.filter((line) => line.mealId === recipe.id).map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  styles={styles}
                  colors={colors}
                  swapOpen={swapFor === line.id}
                  swapDraft={swapDraft}
                  onSwapDraft={setSwapDraft}
                  onOpenSwap={() => {
                    setSwapFor(swapFor === line.id ? null : line.id);
                    setSwapDraft(line.swap || '');
                  }}
                  onUse={() => applySwap(line)}
                  onGot={() => setGot(line)}
                  onDrop={() => setDropped(line)}
                  onPrice={(raw) => setPrice(line, raw)}
                  priceText={priceDrafts[line.id] != null ? priceDrafts[line.id] : (line.guidePence / 100).toFixed(2)}
                  onPriceDraft={(raw) => setPriceDrafts((prev) => ({ ...prev, [line.id]: raw }))}
                  copied={copiedId === line.id}
                  onCopy={() => copyItem(line)}
                  shopLabel={shopLabel}
                  onOpenShop={() => openItem(line)}
                />
              ))}
            </View>
          ))
        : basket.map((groupLines) => {
            const open = groupLines.filter((line) => !line.dropped);
            const inBasket = open.length > 0 && open.every((line) => line.got);
            return (
              <View key={groupLines[0].id} style={styles.card}>
                <TouchableOpacity
                  style={styles.tickRow}
                  onPress={() => setGotLines(groupLines)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: inBasket }}
                >
                  <View style={[styles.tickBox, inBasket && styles.tickBoxOn]}>
                    {inBasket ? <Text style={styles.tickMark}>✓</Text> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mealName, inBasket && styles.struck]}>{displayName(groupLines[0])}</Text>
                    <Text style={styles.meta}>{groupLines.map((line) => line.mealName).join(' · ')}</Text>
                    <Text style={styles.meta}>{inBasket ? 'In the basket' : 'Not in the basket yet'} · {formatPence(groupLines.reduce((sum, line) => sum + lineCost(line), 0))}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chip} onPress={() => copyItem(groupLines[0])}>
                  <Text style={styles.chipText}>{copiedId === groupLines[0].id ? 'Copied' : 'Copy'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondary} onPress={() => openItem(groupLines[0])}>
                  <Text style={styles.secondaryText}>Open this in {shopLabel}</Text>
                </TouchableOpacity>
              </View>
            );
          })}

      <TouchableOpacity style={styles.primary} onPress={markPricesChecked}>
        <Text style={styles.primaryText}>Prices checked, no longer estimated</Text>
      </TouchableOpacity>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Checked total</Text>
        {lines.some((line) => !line.dropped && line.checked) ? (
          <>
            {recipes.filter((recipe) => selectedOn(recipe.id)).map((recipe) => {
              const mealLines = lines.filter((line) => line.mealId === recipe.id && !line.dropped && line.checked);
              if (!mealLines.length) return null;
              const mealTotal = mealLines.reduce((sum, line) => sum + lineCost(line), 0);
              return (
                <View key={recipe.id}>
                  <Text style={styles.mealName}>{recipe.name}</Text>
                  {mealLines.map((line) => (
                    <Text key={line.id} style={styles.meta}>
                      {displayName(line)} · {formatPence(line.guidePence)}
                    </Text>
                  ))}
                  <Text style={styles.intro}>{formatPence(mealTotal)} for this meal</Text>
                </View>
              );
            })}
            <Text style={styles.summaryValue}>
              {formatPence(lines.filter((line) => !line.dropped && line.checked).reduce((sum, line) => sum + lineCost(line), 0))} total
            </Text>
            <Text style={styles.intro}>These are the prices you entered, not estimates.</Text>
          </>
        ) : (
          <Text style={styles.intro}>Type a price on each item, then press Prices checked.</Text>
        )}
        {lines.some((line) => !line.dropped && !line.checked) ? (
          <Text style={styles.intro}>
            {lines.filter((line) => !line.dropped && !line.checked).length} still estimated and not in this total.
          </Text>
        ) : null}
      </View>
      <TouchableOpacity style={styles.secondary} onPress={() => savePrices(false)}>
        <Text style={styles.secondaryText}>Save prices for later</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.primary} onPress={openNext}>
        <Ionicons name="storefront-outline" size={18} color="#fff" />
        <Text style={styles.primaryText}>Open next item in {shopLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={copyList}>
        <Text style={styles.secondaryText}>Copy for a note or Timeline Bot</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={shareWithFriend} disabled={sharing}>
        <Text style={styles.secondaryText}>{sharing ? 'Preparing the invite…' : 'Share with a friend'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondary}
        onPress={() => Linking.openURL(SHOPS.find((s) => s.id === shop)?.home || SHOPS[0].home)}
      >
        <Text style={styles.secondaryText}>Open {shopLabel} home</Text>
      </TouchableOpacity>
      <Text style={styles.intro}>
        Take the list into a supermarket if you would rather walk the aisles. Online, Timeline only opens the shop and copies the lines. It does not hold a card, and neither should a chat bot. You sign in there and you pay there.
      </Text>
    </ScrollView>
  );
}

function LineCard({
  line,
  styles,
  colors,
  swapOpen,
  swapDraft,
  onSwapDraft,
  onOpenSwap,
  onUse,
  onGot,
  onDrop,
  onPrice,
  priceText,
  onPriceDraft,
  copied,
  onCopy,
  shopLabel,
  onOpenShop,
}) {
  return (
    <View style={[styles.card, line.dropped && { opacity: 0.6 }]}>
      <TouchableOpacity
        style={styles.tickRow}
        disabled={line.dropped}
        onPress={onGot}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!line.got }}
      >
        <View style={[styles.tickBox, line.got && styles.tickBoxOn]}>
          {line.got ? <Text style={styles.tickMark}>✓</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.mealName, (line.got || line.dropped) && styles.struck]}>
            {displayName(line)}
            {line.swap.trim() ? <Text style={styles.meta}> · instead of {line.name}</Text> : null}
          </Text>
          <Text style={styles.meta}>
            {line.got ? 'In the basket' : 'Not in the basket yet'} · {line.qty} · for {line.mealName}
            {line.checked ? ' · price checked' : line.entered ? ' · typed, not checked yet' : ' · estimate'}
          </Text>
        </View>
      </TouchableOpacity>
      <Text style={styles.label}>{line.checked ? 'Checked £' : 'Price £'}</Text>
      <TextInput
        style={[styles.input, { maxWidth: 140 }]}
        value={priceText}
        onChangeText={onPriceDraft}
        onEndEditing={(e) => onPrice(e.nativeEvent.text)}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.faint}
      />
      <View style={styles.row}>
        <TouchableOpacity style={styles.chip} onPress={onCopy}>
          <Text style={styles.chipText}>{copied ? 'Copied' : 'Copy'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} onPress={onOpenSwap}>
          <Text style={styles.chipText}>Swap</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} onPress={onDrop}>
          <Text style={styles.chipText}>{line.dropped ? 'Put back' : 'Skip this meal'}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.secondary} onPress={onOpenShop}>
        <Text style={styles.secondaryText}>Open this in {shopLabel}</Text>
      </TouchableOpacity>
      {swapOpen ? (
        <View style={styles.rowBetween}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={swapDraft}
            onChangeText={onSwapDraft}
            placeholder="Yoghurt instead of soured cream"
            placeholderTextColor={colors.faint}
          />
          <TouchableOpacity style={styles.smallBtn} onPress={onUse}>
            <Text style={styles.smallBtnText}>Use</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
    heading: { color: c.text, fontSize: 26, fontWeight: '800', marginBottom: 6 },
    intro: { color: c.faint, fontSize: 13, lineHeight: 18, marginTop: 6 },
    section: { color: c.text, fontSize: 18, fontWeight: '700', marginTop: 18 },
    summary: {
      marginTop: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.cardBorder,
      backgroundColor: c.card,
      padding: 14,
    },
    summaryLabel: { color: c.text, fontWeight: '700' },
    summaryValue: { color: c.blue, fontSize: 22, fontWeight: '800', marginTop: 6 },
    card: {
      marginTop: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.cardBorder,
      backgroundColor: c.card,
      padding: 12,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    mealName: { color: c.text, fontWeight: '700', fontSize: 16 },
    note: { color: c.text, fontSize: 13, lineHeight: 18, marginTop: 6 },
    mealHead: { color: c.text, fontWeight: '700', marginTop: 16 },
    meta: { color: c.faint, fontSize: 12, marginTop: 2 },
    struck: { textDecorationLine: 'line-through' },
    tickRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    tickBox: {
      width: 28,
      height: 28,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tickBoxOn: { backgroundColor: c.blue },
    tickMark: { color: '#fff', fontWeight: '800', fontSize: 16 },
    label: { color: c.faint, fontSize: 12, marginTop: 8, marginBottom: 4 },
    input: {
      backgroundColor: c.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      color: c.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    items: { minHeight: 80, textAlignVertical: 'top' },
    toggle: {
      minWidth: 52,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bg,
    },
    toggleOn: { backgroundColor: c.blue, borderColor: c.blue },
    toggleText: { color: c.faint, fontWeight: '700' },
    toggleOnText: { color: '#fff' },
    chip: {
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bg,
    },
    chipOn: { backgroundColor: c.blue, borderColor: c.blue },
    chipText: { color: c.faint, fontWeight: '600' },
    chipOnText: { color: '#fff' },
    smallBtn: {
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallBtnText: { color: c.text, fontWeight: '700' },
    primary: {
      marginTop: 16,
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    secondary: {
      marginTop: 8,
      minHeight: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { color: c.text, fontWeight: '700' },
  });
}
