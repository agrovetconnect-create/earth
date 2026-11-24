import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * Burns the Earth Talk credit strip into a photo, off-screen — the mobile
 * equivalent of the web build's canvas `stampImageWithCredit`: the photo is
 * rendered in a hidden view with a translucent dark strip along the bottom
 * (location line + "Earth Talk GeoAI - Contributed by …" line), then captured
 * to PNG base64. The image renders at a capped longest edge so the capture
 * stays within memory limits; callers keep the untouched original if
 * stamping fails.
 */

export interface PhotoCreditStampRef {
  /** Returns the stamped image as PNG base64 (no data-url prefix). */
  stamp(imageUri: string, line1: string, line2: string): Promise<string>;
}

interface StampJob {
  uri: string;
  line1: string;
  line2: string;
  width: number;
  height: number;
}

interface PhotoCreditStampProps {
  /** Longest-edge cap for the stamped output. */
  maxEdge?: number;
  /** Reader-controlled text-size multiplier for the strip (0.7–1.6). */
  scale?: number;
}

/** Strip metrics, mirroring the web canvas math (`stripMetrics` on web).
 *  `textScale` is the contributor's credit-text-size preference. */
function stripMetrics(width: number, height: number, textScale = 1) {
  const scale = Math.max(0.8, Math.min(width, height) / 1080) * textScale;
  return {
    strip: Math.round(62 * scale),
    pad: Math.round(18 * scale),
    titleSize: Math.max(9, Math.round(13 * scale)),
    subSize: Math.max(8, Math.round(11.5 * scale)),
  };
}

function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => reject(new Error('Could not read the photo dimensions'))
    );
  });
}

function fittedSize(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

export const PhotoCreditStamp = forwardRef<PhotoCreditStampRef, PhotoCreditStampProps>(
  function PhotoCreditStamp({ maxEdge = 1600, scale = 1 }, ref) {
    const viewRef = useRef<View | null>(null);
    const loadedRef = useRef(false);
    const [job, setJob] = useState<StampJob | null>(null);

    const stamp = useCallback(
      (imageUri: string, line1: string, line2: string): Promise<string> =>
        new Promise<string>((resolve, reject) => {
          void (async () => {
            try {
              const size = await imageSize(imageUri);
              const fitted = fittedSize(size.width, size.height, maxEdge);
              loadedRef.current = false;
              setJob({ uri: imageUri, line1, line2, ...fitted });

              // Wait for the Image's onLoad (or give up after 8 s and capture
              // whatever rendered — a plain photo usually decodes in ms).
              const deadline = Date.now() + 8000;
              while (!loadedRef.current && Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 50));
              }

              const base64 = await captureRef(viewRef, {
                format: 'png',
                quality: 1,
                result: 'base64',
              });
              resolve(base64);
            } catch (error) {
              reject(error instanceof Error ? error : new Error('Stamping failed'));
            } finally {
              setJob(null);
            }
          })();
        }),
      [maxEdge]
    );

    useImperativeHandle(ref, () => ({ stamp }), [stamp]);

    const metrics = job ? stripMetrics(job.width, job.height, scale) : null;
    return (
      // Off-screen workspace: real rendered pixels, outside the visible layout.
      // collapsable={false} keeps Android from flattening it away.
      <View
        ref={viewRef}
        collapsable={false}
        style={[styles.workspace, job ? { width: job.width, height: job.height } : null]}
      >
        {job && metrics ? (
          <View style={{ width: job.width, height: job.height }}>
            <Image
              source={{ uri: job.uri }}
              style={{ width: job.width, height: job.height }}
              resizeMode="cover"
              onLoad={() => {
                loadedRef.current = true;
              }}
              fadeDuration={0}
            />
            <View style={[styles.strip, { height: metrics.strip, paddingHorizontal: metrics.pad }]}>
              <Text
                numberOfLines={1}
                style={{ color: '#ffffff', fontWeight: '600', fontSize: metrics.titleSize }}
              >
                {job.line1}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: '#ffffff',
                  fontWeight: '400',
                  fontSize: metrics.subSize,
                  marginTop: Math.round(metrics.strip * 0.08),
                }}
              >
                {job.line2}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  workspace: {
    // Rendered but far off-screen; captureRef needs real pixels.
    position: 'absolute',
    top: 0,
    left: -10000,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8, 8, 14, 0.55)',
    justifyContent: 'center',
    gap: 2,
  },
});
