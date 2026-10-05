import React, { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../themeContext';
import {
  DATE_FORMAT_MDY,
  calendarParts,
  formatFullDate,
  getDateFormat,
  normalizeDateFormat,
} from '../services/dateFormat';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function isoFromParts(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function monthCells(year, month) {
  const first = new Date(year, month - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let day = 1; day <= count; day += 1) cells.push(day);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export default function DateField({ value, onChange, editable = true, style }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState('dmy');
  const selected = calendarParts(value);
  const today = calendarParts(new Date());
  const [cursor, setCursor] = useState({
    y: (selected || today).y,
    m: (selected || today).m,
  });

  useEffect(() => {
    getDateFormat().then((next) => setFormat(normalizeDateFormat(next))).catch(() => {});
  }, [open]);

  const cells = useMemo(() => monthCells(cursor.y, cursor.m), [cursor.y, cursor.m]);
  const shown = selected ? formatFullDate(value, format) : '';
  const orderHint = format === DATE_FORMAT_MDY ? 'MM/DD/YYYY' : 'DD/MM/YYYY';

  const shiftMonth = (delta) => {
    const next = new Date(cursor.y, cursor.m - 1 + delta, 1);
    setCursor({ y: next.getFullYear(), m: next.getMonth() + 1 });
  };

  const openCalendar = () => {
    if (!editable) return;
    const base = selected || today;
    setCursor({ y: base.y, m: base.m });
    setOpen(true);
  };

  const choose = (day) => {
    if (!day) return;
    onChange(isoFromParts(cursor.y, cursor.m, day));
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.field,
          { backgroundColor: colors.card, borderColor: colors.cardBorder },
          !editable && styles.locked,
          style,
        ]}
        onPress={openCalendar}
        disabled={!editable}
        accessibilityRole="button"
        accessibilityLabel={shown ? `Date ${shown}` : 'Choose a date'}
      >
        <Text style={{ color: shown ? colors.text : colors.faint, fontSize: 16 }}>
          {shown || 'Choose a date'}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              {MONTHS[cursor.m - 1]} {cursor.y}
            </Text>
            <Text style={[styles.hint, { color: colors.faint }]}>Shown as {orderHint}</Text>
            <View style={styles.nav}>
              <TouchableOpacity style={styles.navBtn} onPress={() => setCursor((c) => ({ ...c, y: c.y - 1 }))}>
                <Text style={[styles.navText, { color: colors.blueSoft }]}>Year −</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navBtn} onPress={() => shiftMonth(-1)}>
                <Text style={[styles.navText, { color: colors.blueSoft }]}>Month −</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navBtn} onPress={() => shiftMonth(1)}>
                <Text style={[styles.navText, { color: colors.blueSoft }]}>Month +</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navBtn} onPress={() => setCursor((c) => ({ ...c, y: c.y + 1 }))}>
                <Text style={[styles.navText, { color: colors.blueSoft }]}>Year +</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.week}>
              {WEEKDAYS.map((name) => (
                <Text key={name} style={[styles.weekday, { color: colors.faint }]}>{name}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((day, index) => {
                const on = !!(day && selected && selected.y === cursor.y && selected.m === cursor.m && selected.d === day);
                const isToday = !!(day && today.y === cursor.y && today.m === cursor.m && today.d === day);
                return (
                  <TouchableOpacity
                    key={`${cursor.y}-${cursor.m}-${index}`}
                    style={[
                      styles.day,
                      on && { backgroundColor: colors.blue },
                      !on && isToday && { borderColor: colors.blue, borderWidth: 1 },
                    ]}
                    onPress={() => choose(day)}
                    disabled={!day}
                  >
                    <Text style={{ color: on ? '#fff' : colors.text, fontWeight: on ? '800' : '500' }}>
                      {day || ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.footer}>
              <TouchableOpacity
                onPress={() => {
                  onChange(isoFromParts(today.y, today.m, today.d));
                  setOpen(false);
                }}
              >
                <Text style={[styles.navText, { color: colors.blueSoft }]}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={[styles.navText, { color: colors.muted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
    justifyContent: 'center',
  },
  locked: { opacity: 0.7 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  hint: { textAlign: 'center', marginTop: 4, marginBottom: 10, fontSize: 12 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  navText: { fontWeight: '700', fontSize: 13 },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
});
