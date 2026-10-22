import React from 'react';
import { Image, Platform, StyleSheet } from 'react-native';
import { asImageUri, photoTurnStyle } from '../services/imagePicker';

function turnDegrees(turn) {
  const n = Number(turn);
  if (!Number.isFinite(n)) return 0;
  return ((Math.round(n / 90) * 90) % 360 + 360) % 360;
}

/** Shows a picked photo. On the web, a normal image tag is used so data: photos are not dropped. */
export default function PhotoView({ uri, style, resizeMode = 'cover', onError, turn = 0 }) {
  const src = asImageUri(uri);
  if (!src) return null;
  const degrees = turnDegrees(turn);
  if (Platform.OS === 'web') {
    const flat = StyleSheet.flatten(style) || {};
    return (
      <div
        style={{
          width: flat.width || '100%',
          height: flat.height || 180,
          marginTop: flat.marginTop,
          marginBottom: flat.marginBottom,
          borderRadius: flat.borderRadius || 0,
          background: flat.backgroundColor || 'transparent',
          borderWidth: flat.borderWidth || undefined,
          borderStyle: flat.borderWidth ? 'solid' : undefined,
          borderColor: flat.borderColor,
          overflow: 'hidden',
          maxWidth: flat.maxWidth || '100%',
          boxSizing: 'border-box',
        }}
      >
        <img
          src={src}
          alt=""
          onError={onError}
          style={{
            width: '100%',
            height: '100%',
            objectFit: resizeMode === 'contain' ? 'contain' : 'cover',
            display: 'block',
            transform: degrees ? 'rotate(' + degrees + 'deg)' : undefined,
            transformOrigin: 'center center',
          }}
        />
      </div>
    );
  }
  const turned = photoTurnStyle(degrees);
  return (
    <Image
      source={{ uri: src }}
      style={turned ? [style, turned] : style}
      resizeMode={resizeMode}
      onError={onError}
    />
  );
}