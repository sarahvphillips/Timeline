import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getEvents, eventClockDate } from '../services/eventService';
import { photoTurnStyle } from '../services/imagePicker';
import {
  CREDITS_PAUSED,
  MEAL_SKYLINE_COST,
  MEAL_SKYLINE_MIN,
  MEAL_SKYLINE_PERK,
  getRewards,
  hasPerk,
  spendShopItem,
} from '../services/rewardsService';
import HomeFab from '../components/HomeFab';

const BANDS = [
  { id: 'night', label: 'Night', from: 0, to: 5, color: '#241c22' },
  { id: 'morning', label: 'Morning', from: 5, to: 11, color: '#3a2e1c' },
  { id: 'afternoon', label: 'Afternoon', from: 11, to: 17, color: '#24352c' },
  { id: 'evening', label: 'Evening', from: 17, to: 24, color: '#3c241c' },
];

const MIN_MIN = 5 * 60;
const MAX_MIN = 23 * 60;

function recipeKey(event) {
  return String(event.recipeName || event.title || '')
    .trim()
    .toLowerCase();
}

function isHelloFreshCard(event) {
  if (String(event?.source || '') !== 'food') return false;
  if (String(event?.mealKit || '').toLowerCase() !== 'hellofresh') return false;
  if (!event.imageUri) return false;
  const details = String(event.recipeName || '').trim() || String(event.foodItems || '').trim();
  return details.length > 0;
}

function dayKey(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function timeLabel(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function dateLabel(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
}

export default function MealSkylineScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState([]);
  const [unlocked, setUnlocked] = useState(CREDITS_PAUSED);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [events, rewards] = await Promise.all([
        getEvents(),
        getRewards().catch(() => null),
      ]);
      const next = (events || []).filter(isHelloFreshCard).map((event) => {
        const clock = eventClockDate(event) || new Date(event.date);
        return { event, clock };
      }).filter((row) => row.clock && !Number.isNaN(row.clock.getTime()));
      next.sort((a, b) => a.clock - b.clock);
      setCards(next);
      setUnlocked(CREDITS_PAUSED || hasPerk(rewards, MEAL_SKYLINE_PERK));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const counts = useMemo(() => {
    const map = {};
    cards.forEach((row) => {
      const key = recipeKey(row.event);
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [cards]);

  const ready = cards.length >= MEAL_SKYLINE_MIN;
  const showMap = ready && unlocked;
  const canvasW = Math.max(320, Math.min(width - 28, 760));
  const canvasH = 460;

  const unlock = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await spendShopItem(MEAL_SKYLINE_PERK);
      setUnlocked(true);
    } catch (e) {
      if (e?.code === 'OWNED') setUnlocked(true);
      else if (e?.code === 'NEED_CREDITS') {
        Alert.alert('Need credits', `Meal skyline costs ${MEAL_SKYLINE_COST} credits.`);
      } else {
        Alert.alert('Could not open the map', e?.message || 'Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Food extra</Text>
        <Text style={styles.title}>Meal skyline</Text>
        <Text style={styles.intro}>
          Days run left to right. The height is the time of day, so a late cook sits higher.
          Each plate is your own photo of that meal. This is not a node graph or the year line.
        </Text>

        {loading ? <ActivityIndicator color="#e7a06a" style={{ marginTop: 24 }} /> : null}

        {!loading && !showMap ? (
          <Progress
            cards={cards}
            unlocked={unlocked}
            busy={busy}
            onUnlock={unlock}
          />
        ) : null}

        {!loading && showMap ? (
          <Skyline
            cards={cards}
            counts={counts}
            width={canvasW}
            height={canvasH}
            pickedId={picked?.event?.id}
            onPick={setPicked}
          />
        ) : null}

        {picked ? (
          <View style={styles.detail}>
            <Text style={styles.detailName}>{picked.event.recipeName || picked.event.title}</Text>
            <Text style={styles.detailMeta}>
              {dateLabel(picked.clock)} · {timeLabel(picked.clock)}
              {picked.event.cookMinutes ? ` · ${picked.event.cookMinutes} min` : ''}
              {counts[recipeKey(picked.event)] > 1
                ? ` · made ${counts[recipeKey(picked.event)]} times`
                : ''}
            </Text>
            {picked.event.mealTags ? <Text style={styles.detailTags}>{picked.event.mealTags}</Text> : null}
            {picked.event.foodItems ? <Text style={styles.detailItems}>{picked.event.foodItems}</Text> : null}
          </View>
        ) : null}
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

function Progress({ cards, unlocked, busy, onUnlock }) {
  const filled = Math.min(MEAL_SKYLINE_MIN, cards.length);
  return (
    <View style={styles.progressCard}>
      <Text style={styles.progressCount}>
        {cards.length} of {MEAL_SKYLINE_MIN} meal-kit cards
      </Text>
      <Text style={styles.progressHint}>
        Each one needs a photo and a recipe name or ingredient list. The skyline stays closed until then,
        so the map is a reward rather than an empty chart.
      </Text>
      <View style={styles.plates}>
        {Array.from({ length: MEAL_SKYLINE_MIN }, (_, i) => {
          const row = cards[i];
          return (
            <View key={i} style={[styles.emptyPlate, row && styles.filledPlate]}>
              {row?.event?.imageUri ? (
                <Image
                  source={{ uri: row.event.imageUri }}
                  style={[styles.platePhoto, photoTurnStyle(row.event.imageRotation)]}
                />
              ) : (
                <Text style={styles.plateMark}>{i + 1}</Text>
              )}
            </View>
          );
        })}
      </View>
      {filled >= MEAL_SKYLINE_MIN && !unlocked ? (
        <TouchableOpacity style={styles.unlock} onPress={onUnlock} disabled={busy}>
          <Text style={styles.unlockText}>
            {busy ? 'Opening…' : `Open the skyline · ${MEAL_SKYLINE_COST} credits`}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.progressHint}>
          While testing, credits are paused, so five finished cards open the map on their own.
        </Text>
      )}
    </View>
  );
}

function Skyline({ cards, counts, width, height, pickedId, onPick }) {
  const padL = 42;
  const padR = 18;
  const padT = 22;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const days = cards.map((row) => dayKey(row.clock));
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);
  const span = Math.max(1, maxDay - minDay);

  const points = cards.map((row, index) => {
    const mins = row.clock.getHours() * 60 + row.clock.getMinutes();
    const t = Math.max(0, Math.min(1, (mins - MIN_MIN) / (MAX_MIN - MIN_MIN)));
    const y = padT + plotH * (1 - t);
    let x = padL + ((dayKey(row.clock) - minDay) / span) * plotW;
    if (minDay === maxDay) x = padL + plotW / 2;
    const clash = cards.slice(0, index).filter((other) => {
      const sameDay = dayKey(other.clock) === dayKey(row.clock);
      const close = Math.abs(other.clock.getHours() - row.clock.getHours()) === 0;
      return sameDay && close;
    }).length;
    return { ...row, x: x + clash * 16, y, index };
  });

  const yForHour = (hour) => {
    const mins = hour * 60;
    const t = (mins - MIN_MIN) / (MAX_MIN - MIN_MIN);
    return padT + plotH * (1 - Math.max(0, Math.min(1, t)));
  };

  return (
    <View>
      <View style={[styles.canvas, { width, height }]}>
        {BANDS.map((band) => {
          const top = yForHour(Math.min(band.to, 23));
          const bottom = yForHour(Math.max(band.from, 5));
          const h = Math.max(8, bottom - top);
          return (
            <View
              key={band.id}
              style={[styles.band, { top, height: h, backgroundColor: band.color }]}
            >
              <Text style={styles.bandLabel}>{band.label}</Text>
            </View>
          );
        })}
        {[8, 12, 18, 22].map((hour) => (
          <Text key={hour} style={[styles.hourLabel, { top: yForHour(hour) - 8 }]}>
            {pad2(hour)}
          </Text>
        ))}
        {points.slice(1).map((point, i) => {
          const prev = points[i];
          const dx = point.x - prev.x;
          const dy = point.y - prev.y;
          const length = Math.max(1, Math.hypot(dx, dy));
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          return (
            <View
              key={`line-${point.event.id}`}
              style={[
                styles.path,
                {
                  width: length,
                  left: (prev.x + point.x) / 2 - length / 2,
                  top: (prev.y + point.y) / 2 - 1.5,
                  transform: [{ rotate: `${angle}deg` }],
                },
              ]}
            />
          );
        })}
        {points.map((point) => {
          const times = counts[recipeKey(point.event)] || 1;
          const on = pickedId === point.event.id;
          return (
            <TouchableOpacity
              key={point.event.id}
              style={[
                styles.plate,
                {
                  left: point.x - 26,
                  top: point.y - 26,
                  borderColor: times > 1 ? '#9dcc6a' : '#f3e2c2',
                },
                on && styles.plateOn,
              ]}
              onPress={() => onPick(point)}
              accessibilityLabel={`${point.event.recipeName || point.event.title} ${timeLabel(point.clock)}`}
            >
              <Image
                source={{ uri: point.event.imageUri }}
                style={[styles.platePhoto, photoTurnStyle(point.event.imageRotation)]}
              />
              {times > 1 ? <Text style={styles.repeat}>×{times}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendText}>Copper line · the order you cooked them</Text>
        <Text style={styles.legendText}>Green ring · the same recipe again</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#161210' },
  content: { padding: 16, paddingBottom: 110 },
  kicker: {
    color: '#e7a06a',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: { color: '#f6efe4', fontSize: 28, fontWeight: '800', marginTop: 4 },
  intro: { color: '#cbbba6', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  canvas: {
    alignSelf: 'center',
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#1a1512',
    borderWidth: 1,
    borderColor: '#5c4636',
  },
  band: { position: 'absolute', left: 0, right: 0, justifyContent: 'flex-start' },
  bandLabel: { color: '#f6efe4', opacity: 0.45, fontSize: 10, fontWeight: '700', marginLeft: 46, marginTop: 4 },
  hourLabel: {
    position: 'absolute',
    left: 8,
    color: '#f3e2c2',
    fontSize: 11,
    fontWeight: '800',
    width: 28,
  },
  path: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#e7a06a',
  },
  plate: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    overflow: 'hidden',
    backgroundColor: '#2a211c',
  },
  plateOn: { borderColor: '#fff4df', transform: [{ scale: 1.08 }] },
  platePhoto: { width: '100%', height: '100%' },
  repeat: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    backgroundColor: '#243018',
    color: '#d5f5b0',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  legend: { marginTop: 10, gap: 2 },
  legendText: { color: '#cbbba6', fontSize: 12 },
  detail: {
    marginTop: 16,
    backgroundColor: '#2a211c',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#5c4636',
  },
  detailName: { color: '#f6efe4', fontSize: 18, fontWeight: '800' },
  detailMeta: { color: '#e7a06a', marginTop: 4, fontWeight: '700' },
  detailTags: { color: '#d5f5b0', marginTop: 6, fontSize: 13 },
  detailItems: { color: '#cbbba6', marginTop: 6, fontSize: 14, lineHeight: 20 },
  progressCard: {
    backgroundColor: '#2a211c',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#5c4636',
  },
  progressCount: { color: '#f6efe4', fontSize: 18, fontWeight: '800' },
  progressHint: { color: '#cbbba6', fontSize: 13, lineHeight: 18, marginTop: 6 },
  plates: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 8 },
  emptyPlate: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#8a7160',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  filledPlate: { borderStyle: 'solid', borderColor: '#f3e2c2' },
  plateMark: { color: '#8a7160', fontWeight: '800' },
  unlock: {
    marginTop: 12,
    backgroundColor: '#e7a06a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  unlockText: { color: '#2a160d', fontWeight: '800' },
});
