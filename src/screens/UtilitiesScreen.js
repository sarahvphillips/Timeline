import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useTheme } from '../themeContext';
import { auth } from '../services/firebase';
import { CREDITS_PAUSED } from '../services/rewardsService';
import { MenuCard, MenuRow, MenuSection } from '../components/MenuGroup';
import DeviceSessionsCard from '../components/DeviceSessionsCard';

export default function UtilitiesScreen({ navigation }) {
  const { colors } = useTheme();
  const signedIn = !!auth.currentUser?.uid;

  const needAccount = (label) => {
    Alert.alert(
      'Create an account for this',
      label + ' needs a signed-in Timeline account. Guest mode stays on this device only.',
    );
  };

  const go = (screen, label) => {
    if (!signedIn && (screen === 'EventsWithFriends' || screen === 'AcceptInvite' || screen === 'CreditFeedback' || screen === 'CreditsShop')) {
      needAccount(label);
      return;
    }
    navigation.navigate(screen);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <MenuSection title="DATES AND NUMBERS">
          <MenuCard colors={colors}>
            <MenuRow colors={colors} icon="ellipse-outline" label="Date circle" onPress={() => go('DateCircle')} />
            <MenuRow
              colors={colors}
              icon="calendar-outline"
              label="Days between dates"
              last
              onPress={() => go('DateSpan')}
            />
          </MenuCard>
        </MenuSection>

        <MenuSection title="GRAPHS">
          <MenuCard colors={colors}>
            <MenuRow
              colors={colors}
              icon="git-network-outline"
              label="People and dates graph"
              onPress={() => go('PeopleDateGraph')}
            />
            <MenuRow colors={colors} icon="text-outline" label="Word to int" onPress={() => go('WordToInt')} />
            <MenuRow colors={colors} icon="git-branch-outline" label="Word graph" onPress={() => go('WordGraph')} />
            <MenuRow colors={colors} icon="analytics-outline" label="Event graph" onPress={() => go('EventGraph')} />
            <MenuRow colors={colors} icon="book-outline" label="Poem patterns" onPress={() => go('PoemInsights')} />
            <MenuRow colors={colors} icon="color-filter-outline" label="Poem graph" onPress={() => go('PoemGraph')} />
            <MenuRow colors={colors} icon="albums-outline" label="Motifs" last onPress={() => go('Motifs')} />
          </MenuCard>
        </MenuSection>
        <Text style={[styles.hint, { color: colors.faint }]}>
          People and dates graph: turn both on to see where a day-count matches two birthdays. Motifs: Norse and Binary so far, based on saved word tags.
        </Text>

        <MenuSection title="SYSTEM CHECKS">
          <MenuCard colors={colors}>
            <MenuRow colors={colors} icon="finger-print-outline" label="Checksums" onPress={() => go('YearOverview')} />
            <MenuRow colors={colors} icon="wifi-outline" label="Starlink check" last onPress={() => go('StarlinkCheck')} />
          </MenuCard>
        </MenuSection>
        <Text style={[styles.hint, { color: colors.faint }]}>
          Checksums: SHA-256 lives on each item, shown via Timeline for now. Starlink check: public IP ASN, plus optional dish at 192.168.100.1.
        </Text>

        {signedIn ? <DeviceSessionsCard uid={auth.currentUser.uid} colors={colors} /> : null}

        <MenuSection title="MORE">
          <MenuCard colors={colors}>
            <MenuRow
              colors={colors}
              icon="people-outline"
              label="Events with friends"
              onPress={() => go('EventsWithFriends', 'Events with friends')}
            />
            <MenuRow
              colors={colors}
              icon="ticket-outline"
              label="Enter invite code"
              onPress={() => go('AcceptInvite', 'Invite codes')}
            />
            <MenuRow colors={colors} icon="water-outline" label="Wash loads" last onPress={() => go('AddWashLoad')} />
          </MenuCard>
        </MenuSection>

        <MenuSection title="TESTING">
          <MenuCard colors={colors}>
            <MenuRow
              colors={colors}
              icon="cash-outline"
              label={CREDITS_PAUSED ? 'Credits (coming after testing)' : 'Credits shop'}
              last
              onPress={() => go(CREDITS_PAUSED ? 'CreditFeedback' : 'CreditsShop', 'Credits')}
            />
          </MenuCard>
        </MenuSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    paddingHorizontal: 4,
  },
});
