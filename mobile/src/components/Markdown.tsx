import React from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing, type } from '../lib/theme';

/**
 * Minimal markdown renderer for CMS-driven pages (about, how-it-works, terms,
 * privacy). Supports headings, bullet/numbered lists, paragraphs, inline
 * bold/italic/code — the subset the CMS editor emits.
 */

interface Segment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

function parseInline(text: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('**')) segments.push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith('`')) segments.push({ text: token.slice(1, -1), code: true });
    else segments.push({ text: token.slice(1, -1), italic: true });
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex) });
  return segments;
}

function InlineText({ text, base }: { text: string; base: StyleProp<TextStyle> }) {
  const segments = parseInline(text);
  return (
    <Text style={base}>
      {segments.map((segment, index) => (
        <Text
          key={index}
          style={
            segment.bold
              ? { fontWeight: '700' }
              : segment.italic
                ? { fontStyle: 'italic' }
                : segment.code
                  ? { fontFamily: undefined, color: colors.onPrimaryContainer, backgroundColor: colors.primaryContainer }
                  : undefined
          }
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

export function Markdown({
  content,
  style,
}: {
  content: string;
  style?: StyleProp<ViewStyle>;
}) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let ordered = false;

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <View key={`list-${blocks.length}`} style={{ marginBottom: spacing.md }}>
        {listItems.map((item, index) => (
          <View
            key={index}
            style={{ flexDirection: 'row', marginBottom: spacing.xs, paddingRight: spacing.sm }}
          >
            <Text style={[type.body, { color: colors.onSurfaceVariant, marginRight: spacing.sm, minWidth: 18 }]}>
              {ordered ? `${index + 1}.` : '•'}
            </Text>
            <Text style={[type.body, { color: colors.onSurface, flex: 1 }]}>
              <InlineText text={item} base={[type.body, { color: colors.onSurface, flex: 1 }]} />
            </Text>
          </View>
        ))}
      </View>
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^\s*$/.test(line)) {
      flushList();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1].length;
      blocks.push(
        <Text
          key={`h-${blocks.length}`}
          style={[
            level <= 1 ? type.title : type.titleSmall,
            {
              color: colors.onSurface,
              marginTop: level <= 1 ? spacing.xl : spacing.lg,
              marginBottom: spacing.sm,
            },
          ]}
        >
          {heading[2]}
        </Text>
      );
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (ordered) flushList();
      ordered = false;
      listItems.push(bullet[1]);
      continue;
    }
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      if (!ordered && listItems.length) flushList();
      ordered = true;
      listItems.push(numbered[1]);
      continue;
    }
    flushList();
    blocks.push(
      <Text
        key={`p-${blocks.length}`}
        style={[type.body, { color: colors.onSurface, marginBottom: spacing.md }]}
      >
        <InlineText text={line} base={[type.body, { color: colors.onSurface, marginBottom: spacing.md }]} />
      </Text>
    );
  }
  flushList();

  return <View style={style}>{blocks}</View>;
}

/** Small labelled section card used across CMS pages and the passport. */
export function SectionCard({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        padding: spacing.lg,
        marginBottom: spacing.md,
      }}
    >
      {title ? (
        <Text style={[type.titleSmall, { color: colors.onSurface, marginBottom: spacing.md }]}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
