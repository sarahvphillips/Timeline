import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/**
 * TEMP design target — remove when the screen matches its sketch.
 * Yellow corner "Design" button that opens a full-screen mock PNG preview.
 */
export default function DesignTargetButton({
  imageSource,
  title = 'Design target (temp)',
}) {
  // TEMP design target — remove when this screen matches sketch.
  const [visible, setVisible] = useState(false);

  return (
    <>
      {/* TEMP design target — remove when this screen matches sketch. */}
      <TouchableOpacity
        style={styles.designBtn}
        onPress={() => setVisible(true)}
        accessibilityLabel="Temporary design target preview"
      >
        <Text style={styles.designBtnText}>Design</Text>
      </TouchableOpacity>

      {/* TEMP design target — remove when this screen matches sketch. */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.designModalBackdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.designModalCard} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.designModalHeader}>
              <Text style={styles.designModalTitle}>{title}</Text>
              <TouchableOpacity
                onPress={() => setVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.designModalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.designImageWrap}>
              <Image
                source={imageSource}
                style={styles.designImage}
                resizeMode="contain"
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// TEMP design target — remove when this screen matches sketch.
const styles = StyleSheet.create({
  designBtn: {
    position: 'absolute',
    top: 8,
    right: 12,
    zIndex: 20,
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  designBtnText: { color: '#fbbf24', fontSize: 12, fontWeight: '700' },
  designModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 12,
  },
  designModalCard: {
    flex: 1,
    maxHeight: SCREEN_H * 0.92,
    backgroundColor: '#0f1024',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#475569',
    overflow: 'hidden',
  },
  designModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  designModalTitle: { color: '#fbbf24', fontSize: 14, fontWeight: '700' },
  designModalClose: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  designImageWrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  designImage: { width: SCREEN_W - 40, height: SCREEN_H * 0.75 },
});
