import React from 'react';
import { Text } from 'react-native';

/**
 * Ported verbatim from the web's ObservationSideCard (L1927): the small
 * visibility note under the comment composer.
 */
export const PublicVisibilityNote: React.FC = () => (
  <Text style={{ marginTop: 4, fontSize: 10.5, lineHeight: 14, color: '#8f8f8f' }}>
    Public post: your words, your display name and the time are visible to everyone.
  </Text>
);
