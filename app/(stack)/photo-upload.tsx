/**
 * PhotoUploadScreen — Drag-drop upload area, analysis states
 * (idle/analysing/done), and Goose suggestions.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';

import { GIcon } from '@/components/ui/g-icon';
import { InkButton } from '@jarida/ink/native';
import { Grey, JaridaPurple, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';


type AnalysisState = 'idle' | 'analysing' | 'done';

interface AnalysisResult {
  label: string;
  confidence: number;
  suggestion: string;
}

const MOCK_RESULTS: AnalysisResult[] = [
  { label: 'Grocery items detected', confidence: 0.94, suggestion: 'Add these to your shopping list: milk, eggs, bread' },
  { label: 'Receipt found', confidence: 0.87, suggestion: 'Total: $42.50 from Trader Joe\'s. Shall I log this expense?' },
  { label: 'Pet detected', confidence: 0.98, suggestion: 'Your golden retriever Max is in the photo! Looking healthy.' },
];

export default function PhotoUploadScreen() {
  const [state, setState] = useState<AnalysisState>('idle');
  const [results, setResults] = useState<AnalysisResult[]>([]);

  const handleUpload = useCallback(() => {
    setState('analysing');
    setTimeout(() => {
      setState('done');
      setResults(MOCK_RESULTS);
    }, 2500);
  }, []);

  const handleReset = useCallback(() => {
    setState('idle');
    setResults([]);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Upload area */}
      <Pressable
        style={[styles.uploadArea, state !== 'idle' && styles.uploadAreaDisabled]}
        onPress={state === 'idle' ? handleUpload : undefined}
      >
        {state === 'idle' && (
          <>
            <View style={styles.uploadIconWrap}>
              <GIcon name="upload" size={32} color={JaridaPurple[400]} />
            </View>
            <Text style={styles.uploadTitle}>Tap to upload a photo</Text>
            <Text style={styles.uploadDesc}>
              Goose will analyze the image and provide smart suggestions
            </Text>
            <View style={styles.uploadFormats}>
              <Text style={styles.formatText}>JPG, PNG, HEIC up to 25MB</Text>
            </View>
          </>
        )}

        {state === 'analysing' && (
          <View style={styles.analysingWrap}>
            <GIcon name="search" size={28} color={AccentPurple} />
            <Text style={styles.analysingTitle}>Analysing...</Text>
            <View style={styles.progressBar}>
              <View style={styles.progressFill} />
            </View>
            <Text style={styles.analysingDesc}>
              Goose is examining the image for objects, text, and context
            </Text>
          </View>
        )}

        {state === 'done' && (
          <View style={styles.doneWrap}>
            <GIcon name="check" size={28} color={Semantic.success} />
            <Text style={styles.doneTitle}>Analysis Complete</Text>
            <Text style={styles.doneDesc}>
              Found {results.length} items in your image
            </Text>
          </View>
        )}
      </Pressable>

      {/* Results */}
      {state === 'done' && (
        <>
          <Text style={styles.sectionLabel}>GOOSE SUGGESTIONS</Text>
          {results.map((r, i) => (
            <View key={i} style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultLabel}>{r.label}</Text>
                <View style={styles.confidenceBadge}>
                  <Text style={styles.confidenceText}>
                    {Math.round(r.confidence * 100)}%
                  </Text>
                </View>
              </View>
              <Text style={styles.resultSuggestion}>{r.suggestion}</Text>
              <View style={styles.resultActions}>
                <Pressable style={styles.resultAction}>
                  <GIcon name="check" size={14} color={Semantic.success} />
                  <Text style={[styles.resultActionText, { color: Semantic.success }]}>Accept</Text>
                </Pressable>
                <Pressable style={styles.resultAction}>
                  <GIcon name="edit" size={14} color={Grey[500]} />
                  <Text style={styles.resultActionText}>Edit</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <InkButton variant="quiet" onPress={handleReset}>
            Upload Another
          </InkButton>
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Grey[50] },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },

  /* Upload area */
  uploadArea: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 240,
    borderRadius: Radii.xl,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: JaridaPurple[200],
    backgroundColor: JaridaPurple[50] + '40',
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  uploadAreaDisabled: {
    borderStyle: 'solid',
    borderColor: Grey[200],
    backgroundColor: Brand.white,
  },
  uploadIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: JaridaPurple[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  uploadTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
    marginBottom: Spacing.sm,
  },
  uploadDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[500],
    textAlign: 'center',
    lineHeight: FontSize.base * 1.5,
    marginBottom: Spacing.md,
  },
  uploadFormats: {
    backgroundColor: Grey[100],
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radii.pill,
  },
  formatText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Grey[500],
  },

  /* Analysing */
  analysingWrap: { alignItems: 'center', gap: Spacing.md },
  analysingTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: JaridaPurple[600],
  },
  progressBar: {
    width: '80%',
    height: 6,
    backgroundColor: Grey[200],
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    width: '65%',
    height: '100%',
    backgroundColor: AccentPurple,
    borderRadius: 3,
  },
  analysingDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    textAlign: 'center',
  },

  /* Done */
  doneWrap: { alignItems: 'center', gap: Spacing.sm },
  doneTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Semantic.success,
  },
  doneDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[500],
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

  /* Result cards */
  resultCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.md,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  resultLabel: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
  },
  confidenceBadge: {
    backgroundColor: Semantic.successSoft,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  confidenceText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Semantic.success,
  },
  resultSuggestion: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[600],
    lineHeight: FontSize.sm * 1.5,
    marginBottom: Spacing.md,
  },
  resultActions: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  resultAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  resultActionText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Grey[500],
  },
});
