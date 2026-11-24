import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTranslator } from '../i18n';

/** A translated `<Text>`; `text` runs through the locale dictionary. */
export function T({
  text,
  vars,
  style,
  ...rest
}: { text: string; vars?: Record<string, string | number>; style?: TextStyle | TextStyle[] } & Omit<TextProps, 'children'>) {
  const t = useTranslator();
  return (
    <Text {...rest} style={style}>
      {t(text, vars)}
    </Text>
  );
}
