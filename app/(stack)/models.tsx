/**
 * AIModelsScreen — Model selection cards with Speed/Quality/Privacy ratings.
 *
 * Temperature slider, context window display, model cards with badges.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';

import { GSlider } from '@/components/ui/g-slider';
import { AI_MODELS, type AIModel } from '@/models/model';
import { Grey, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';


/** Star rating bar */
function RatingBar({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
  return (
    <View style={styles.ratingRow}>
      <Text style={styles.ratingLabel}>{label}</Text>
      <View style={styles.ratingDots}>
        {Array.from({ length: max }).map((_, i) => (
          <View
            key={i}
            style={[styles.ratingDot, i < value && styles.ratingDotFilled]}
          />
        ))}
      </View>
    </View>
  );
}

/** Model card */
const ModelCard = React.memo(function ModelCard({
  model,
  isSelected,
  onSelect,
}: {
  model: AIModel;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(model.id), [model.id, onSelect]);

  return (
    <Pressable
      style={[styles.modelCard, isSelected && styles.modelCardSelected]}
      onPress={handlePress}
    >
      <View style={styles.modelCardHeader}>
        <View>
          <Text style={styles.modelName}>{model.name}</Text>
          <Text style={styles.modelProvider}>{model.provider}</Text>
        </View>
        <View style={[styles.modelBadge, { backgroundColor: model.badgeColor + '18' }]}>
          <Text style={[styles.modelBadgeText, { color: model.badgeColor }]}>
            {model.badge}
          </Text>
        </View>
      </View>

      <Text style={styles.modelDesc}>{model.description}</Text>

      <View style={styles.ratingsSection}>
        <RatingBar label="Speed" value={model.speed} />
        <RatingBar label="Quality" value={model.quality} />
        <RatingBar label="Privacy" value={model.privacy} />
      </View>

      {isSelected && (
        <View style={styles.selectedIndicator}>
          <Text style={styles.selectedText}>Active</Text>
        </View>
      )}
    </Pressable>
  );
});

export default function AIModelsScreen() {
  const [selectedModel, setSelectedModel] = useState('goose-2');
  const [temperature, setTemperature] = useState(0.7);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Temperature slider */}
      <View style={styles.sliderCard}>
        <GSlider
          label="Temperature"
          value={temperature}
          onValueChange={setTemperature}
          min={0}
          max={2}
          step={0.1}
        />
      </View>

      {/* Context window info */}
      <View style={styles.contextRow}>
        <Text style={styles.contextLabel}>Context Window</Text>
        <Text style={styles.contextValue}>128K tokens</Text>
      </View>

      {/* Model cards */}
      <Text style={styles.sectionLabel}>AVAILABLE MODELS</Text>
      {AI_MODELS.map((m) => (
        <ModelCard
          key={m.id}
          model={m}
          isSelected={selectedModel === m.id}
          onSelect={setSelectedModel}
        />
      ))}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Grey[50] },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },

  /* Slider card */
  sliderCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.lg,
  },

  /* Context window */
  contextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Brand.white,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.xl,
  },
  contextLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[600],
  },
  contextValue: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
  },

  /* Section label */
  sectionLabel: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Grey[500],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },

  /* Model card */
  modelCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.md,
  },
  modelCardSelected: {
    borderColor: AccentPurple,
    borderWidth: 2,
  },
  modelCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  modelName: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
  },
  modelProvider: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginTop: 2,
  },
  modelBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.pill,
  },
  modelBadgeText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  modelDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[600],
    lineHeight: FontSize.sm * 1.5,
    marginBottom: Spacing.md,
  },

  /* Ratings */
  ratingsSection: { gap: Spacing.sm },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[500],
    width: 60,
  },
  ratingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  ratingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Grey[200],
  },
  ratingDotFilled: {
    backgroundColor: AccentPurple,
  },

  /* Selected indicator */
  selectedIndicator: {
    alignSelf: 'flex-start',
    backgroundColor: Semantic.successSoft,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radii.pill,
    marginTop: Spacing.md,
  },
  selectedText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Semantic.success,
  },
});
