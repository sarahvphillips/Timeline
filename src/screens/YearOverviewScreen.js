import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getEvents, getYearSummaries } from '../services/eventService';

export default function YearOverviewScreen({ navigation }) {
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const events = await getEvents();
    setYears(getYearSummaries(events));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.spine} />
        {years.map((item, index) => {
          const left = index % 2 === 0;
          return (
            <View key={item.year} style={styles.row}>
              {left ? (
                <TouchableOpacity
                  style={[styles.bubble, styles.bubbleLeft]}
                  onPress={() => navigation.navigate('MonthOverview', { year: item.year })}
                >
                  <Text style={styles.count}>{item.count}</Text>
                  <Text style={styles.countLabel}>{item.count === 1 ? 'event' : 'events'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.spacer} />
              )}

              <TouchableOpacity
                style={styles.yearCol}
                onPress={() => navigation.navigate('MonthOverview', { year: item.year })}
                accessibilityLabel={`Open ${item.year}`}
              >
                <View style={styles.dot} />
                <Text style={styles.year}>{item.year}</Text>
              </TouchableOpacity>

              {!left ? (
                <TouchableOpacity
                  style={[styles.bubble, styles.bubbleRight]}
                  onPress={() => navigation.navigate('MonthOverview', { year: item.year })}
                >
                  <Text style={styles.count}>{item.count}</Text>
                  <Text style={styles.countLabel}>{item.count === 1 ? 'event' : 'events'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.spacer} />
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1024',
  },
  center: {
    flex: 1,
    backgroundColor: '#0f1024',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    paddingVertical: 32,
    paddingHorizontal: 12,
  },
  spine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 14,
    marginLeft: -7,
    backgroundColor: '#8b5cf6',
    borderRadius: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
    minHeight: 72,
  },
  yearCol: {
    width: 72,
    alignItems: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#8b5cf6',
    marginBottom: 4,
  },
  year: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '700',
  },
  bubble: {
    flex: 1,
    minWidth: 0,
    maxWidth: '42%',
    backgroundColor: '#1a1b36',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    borderRadius: 40,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  bubbleLeft: {
    marginRight: 8,
  },
  bubbleRight: {
    marginLeft: 8,
  },
  spacer: {
    flex: 1,
  },
  count: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
  },
  countLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
});
