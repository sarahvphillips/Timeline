import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

let channelReady = false;

function pad(n) {
  return String(n).padStart(2, '0');
}

export function splitReminder(iso) {
  const parsed = new Date(iso || '');
  if (!iso || Number.isNaN(parsed.getTime())) return { date: '', time: '' };
  return {
    date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
  };
}

export function reminderWhen(dateText, timeText) {
  const day = String(dateText || '').trim();
  const time = String(timeText || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const when = new Date(`${day}T${time}:00`);
  if (Number.isNaN(when.getTime())) return null;
  return when;
}

export function reminderLabel(iso) {
  const parts = splitReminder(iso);
  if (!parts.date) return '';
  const [y, m, d] = parts.date.split('-');
  return `${d}/${m}/${y} at ${parts.time}`;
}

async function ensureReady() {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android' && !channelReady) {
    await Notifications.setNotificationChannelAsync('event-reminders', {
      name: 'Event reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
    channelReady = true;
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.status === 'granted';
}

export async function cancelReminder(id) {
  if (!id || Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (_) {}
}

/** Schedule or clear a local notification. The switch must be on, or nothing is set. */
export async function applyEventReminder(event, { on, when }) {
  if (event?.reminderId) await cancelReminder(event.reminderId);
  if (!on || !when) {
    return { ...event, remindOn: false, remindAt: null, reminderId: null };
  }
  if (when.getTime() <= Date.now() + 15000) {
    const error = new Error('Choose a reminder time that is still ahead.');
    error.code = 'PAST';
    throw error;
  }
  if (Platform.OS === 'web') {
    return { ...event, remindOn: true, remindAt: when.toISOString(), reminderId: null };
  }
  const allowed = await ensureReady();
  if (!allowed) {
    const error = new Error('Allow notifications for Timeline, then save the reminder again.');
    error.code = 'DENIED';
    throw error;
  }
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: event.title || 'Timeline',
      body: 'Reminder for this event',
      sound: 'default',
      data: { eventId: event.id || '' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: 'event-reminders',
    },
  });
  return { ...event, remindOn: true, remindAt: when.toISOString(), reminderId: id };
}
