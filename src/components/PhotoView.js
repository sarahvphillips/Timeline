import React from 'react';
import { Image, Platform } from 'react-native';
import { asImageUri } from '../services/imagePicker';

/** Shows a picked photo. On the web, a normal image tag is used so data: photos are not dropped. */
export default function PhotoView({ uri, style, resizeMode = 'cover', onError }) {
  const src = asImageUri(uri);
  if (!src) return null;
  if (Platform.OS === 'web') {
    const flat = style || {};
    return (
      <img
        src={src}
        alt=""
        onError={onError}
        style={{
          width: flat.width || '100%',
          height: flat.height || 180,
          objectFit: resizeMode === 'contain' ? 'contain' : 'cover',
          borderRadius: flat.borderRadius || 0,
          background: flat.backgroundColor || 'transparent',
          display: 'block',
          maxWidth: '100%',
        }}
      />
    );
  }
  return <Image source={{ uri: src }} style={style} resizeMode={resizeMode} onError={onError} />;
}
