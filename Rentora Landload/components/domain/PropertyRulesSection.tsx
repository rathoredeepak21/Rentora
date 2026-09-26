import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { useTheme, useStyles, typography, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';

export const DEFAULT_PROPERTY_RULES = [
  'Rent should be paid on time.',
  'Keep the property clean and hygienic.',
  'Do not create excessive noise.',
  'Unauthorized occupants are not allowed.',
  'Use electricity and water responsibly.',
  'Do not damage property or fixtures.',
  'Inform the landlord before vacating the property.',
  'Illegal activities are not permitted.',
];

// Helper to normalize rule for matching default suggestions
const normalizeRule = (r: string) => r.trim().toLowerCase();

interface PropertyRulesSectionProps {
  initialRules?: string[];
  onChange: (rules: string[]) => void;
}

export const PropertyRulesSection: React.FC<PropertyRulesSectionProps> = ({
  initialRules = [],
  onChange,
}) => {
  const { colors, isDark } = useTheme();
  const styles = useStyles(getStyles);

  const [selectedDefaults, setSelectedDefaults] = useState<string[]>([]);
  const [customRules, setCustomRules] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const initializedRef = useRef(false);

  // Sync initialRules when loaded from Firestore or parent
  useEffect(() => {
    if (initialRules && initialRules.length > 0 && !initializedRef.current) {
      const defs: string[] = [];
      const customs: string[] = [];

      initialRules.forEach((rule) => {
        const foundDefault = DEFAULT_PROPERTY_RULES.find(
          (d) => normalizeRule(d) === normalizeRule(rule)
        );
        if (foundDefault) {
          defs.push(foundDefault);
        } else {
          customs.push(rule);
        }
      });

      setSelectedDefaults(defs);
      setCustomRules(customs);
      initializedRef.current = true;
    }
  }, [initialRules]);

  const notifyChange = (defs: string[], customs: string[]) => {
    onChange([...defs, ...customs]);
  };

  const toggleDefaultRule = (rule: string) => {
    let updated: string[];
    if (selectedDefaults.includes(rule)) {
      updated = selectedDefaults.filter((r) => r !== rule);
    } else {
      updated = [...selectedDefaults, rule];
    }
    setSelectedDefaults(updated);
    notifyChange(updated, customRules);
  };

  const handleAddOrUpdateCustomRule = () => {
    const trimmed = customInput.trim();
    if (!trimmed) {
      Alert.alert('Empty Rule', 'Please enter custom rule text before adding.');
      return;
    }

    if (editingIndex !== null) {
      const updated = [...customRules];
      updated[editingIndex] = trimmed;
      setCustomRules(updated);
      setEditingIndex(null);
      setCustomInput('');
      notifyChange(selectedDefaults, updated);
    } else {
      const isAlreadyDefault = selectedDefaults.some((r) => normalizeRule(r) === normalizeRule(trimmed));
      const isAlreadyCustom = customRules.some((r) => normalizeRule(r) === normalizeRule(trimmed));

      if (isAlreadyDefault || isAlreadyCustom) {
        Alert.alert('Duplicate Rule', 'This rule is already included in your list.');
        return;
      }

      const updated = [...customRules, trimmed];
      setCustomRules(updated);
      setCustomInput('');
      notifyChange(selectedDefaults, updated);
    }
  };

  const handleEditCustom = (index: number) => {
    setEditingIndex(index);
    setCustomInput(customRules[index]);
  };

  const handleDeleteCustom = (index: number) => {
    const updated = customRules.filter((_, i) => i !== index);
    setCustomRules(updated);
    if (editingIndex === index) {
      setEditingIndex(null);
      setCustomInput('');
    }
    notifyChange(selectedDefaults, updated);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setCustomInput('');
  };

  const totalRulesCount = selectedDefaults.length + customRules.length;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleIconBadge}>
          <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>PROPERTY RULES</Text>
          <Text style={styles.cardSubtitle}>
            Define property guidelines for tenants. Active rules will appear in the Tenant App under My Documents.
          </Text>
        </View>
      </View>

      {/* Status Banner */}
      {totalRulesCount === 0 ? (
        <View style={styles.emptyStatusBanner}>
          <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.emptyStatusText}>No rules added yet.</Text>
        </View>
      ) : (
        <View style={styles.activeStatusBanner}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.secondary} />
          <Text style={styles.activeStatusText}>
            {totalRulesCount} {totalRulesCount === 1 ? 'rule' : 'rules'} selected for this property
          </Text>
        </View>
      )}

      {/* Default Rules Section */}
      <View style={styles.sectionDivider} />
      <Text style={styles.subHeader}>Default Rules</Text>
      <Text style={styles.helperText}>Select the rules that apply to this property:</Text>

      <View style={styles.rulesList}>
        {DEFAULT_PROPERTY_RULES.map((rule, idx) => {
          const isSelected = selectedDefaults.includes(rule);
          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.ruleItem,
                isSelected && styles.ruleItemSelected,
              ]}
              onPress={() => toggleDefaultRule(rule)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={20}
                color={isSelected ? colors.primary : colors.textSecondary}
                style={styles.checkIcon}
              />
              <Text
                style={[
                  styles.ruleText,
                  isSelected ? styles.ruleTextSelected : styles.ruleTextUnselected,
                ]}
              >
                {rule}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Custom Rules Section */}
      <View style={styles.sectionDivider} />
      <Text style={styles.subHeader}>Add Custom Rule</Text>
      <View style={styles.customInputContainer}>
        <TextInput
          style={styles.customTextInput}
          placeholder="Enter custom property rule... (e.g. Visitors are not allowed after 10 PM)"
          placeholderTextColor={colors.placeholder}
          value={customInput}
          onChangeText={setCustomInput}
          multiline
        />
        <View style={styles.customBtnRow}>
          {editingIndex !== null && (
            <TouchableOpacity
              style={[styles.smallBtn, styles.cancelBtn]}
              onPress={handleCancelEdit}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.smallBtn, styles.addBtn]}
            onPress={handleAddOrUpdateCustomRule}
            activeOpacity={0.8}
          >
            <Ionicons
              name={editingIndex !== null ? 'checkmark' : 'add'}
              size={16}
              color={colors.white}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.addBtnText}>
              {editingIndex !== null ? 'Save Rule' : 'Add Rule'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Custom Rules List */}
      {customRules.length > 0 && (
        <View style={styles.customRulesWrapper}>
          <Text style={styles.subHeader}>Custom Rules</Text>
          <View style={styles.customRulesList}>
            {customRules.map((rule, idx) => (
              <View key={idx} style={styles.customRuleRow}>
                <Text style={styles.bulletSymbol}>•</Text>
                <Text style={styles.customRuleText}>{rule}</Text>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    onPress={() => handleEditCustom(idx)}
                    style={styles.editActionBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="pencil" size={13} color={colors.primary} />
                    <Text style={styles.editActionText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteCustom(idx)}
                    style={styles.deleteActionBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash" size={13} color={colors.danger} />
                    <Text style={styles.deleteActionText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const getStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: spacing.borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      ...spacing.shadows.light,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    titleIconBadge: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    cardTitle: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.bold,
      color: colors.text,
      letterSpacing: 0.5,
    },
    cardSubtitle: {
      fontSize: typography.sizes.xs,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 17,
    },
    emptyStatusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      backgroundColor: colors.warningLight,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
      borderRadius: spacing.borderRadius.md,
      marginTop: spacing.sm,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    emptyStatusText: {
      fontSize: typography.sizes.xs + 1,
      fontWeight: typography.weights.semibold,
      color: colors.warning,
    },
    activeStatusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      backgroundColor: colors.secondaryLight,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
      borderRadius: spacing.borderRadius.md,
      marginTop: spacing.sm,
    },
    activeStatusText: {
      fontSize: typography.sizes.xs + 1,
      fontWeight: typography.weights.semibold,
      color: colors.secondary,
    },
    sectionDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.md,
    },
    subHeader: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.bold,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    helperText: {
      fontSize: typography.sizes.xs,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    rulesList: {
      gap: spacing.xs + 2,
    },
    ruleItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm + 2,
      borderRadius: spacing.borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    ruleItemSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },
    checkIcon: {
      marginRight: spacing.sm,
    },
    ruleText: {
      flex: 1,
      fontSize: typography.sizes.sm,
      lineHeight: 19,
    },
    ruleTextSelected: {
      color: colors.text,
      fontWeight: typography.weights.semibold,
    },
    ruleTextUnselected: {
      color: colors.textSecondary,
    },
    customInputContainer: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.borderRadius.md,
      backgroundColor: colors.background,
      padding: spacing.sm,
      marginBottom: spacing.xs,
    },
    customTextInput: {
      fontSize: typography.sizes.sm,
      color: colors.text,
      minHeight: 48,
      textAlignVertical: 'top',
    },
    customBtnRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    smallBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 3,
      borderRadius: spacing.borderRadius.sm,
    },
    addBtn: {
      backgroundColor: colors.primary,
    },
    addBtnText: {
      color: colors.white,
      fontSize: typography.sizes.xs + 1,
      fontWeight: typography.weights.bold,
    },
    cancelBtn: {
      backgroundColor: colors.border,
    },
    cancelBtnText: {
      color: colors.text,
      fontSize: typography.sizes.xs + 1,
      fontWeight: typography.weights.medium,
    },
    customRulesWrapper: {
      marginTop: spacing.md,
    },
    customRulesList: {
      marginTop: spacing.xs,
      gap: spacing.xs + 2,
    },
    customRuleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: spacing.borderRadius.md,
      backgroundColor: colors.background,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bulletSymbol: {
      fontSize: 18,
      color: colors.primary,
      fontWeight: typography.weights.bold,
      marginRight: spacing.xs + 2,
      lineHeight: 18,
    },
    customRuleText: {
      flex: 1,
      fontSize: typography.sizes.sm,
      color: colors.text,
      lineHeight: 18,
    },
    actionButtons: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginLeft: spacing.sm,
    },
    editActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.xs + 3,
      paddingVertical: spacing.xs,
      borderRadius: spacing.borderRadius.sm,
      backgroundColor: colors.primaryLight,
    },
    editActionText: {
      fontSize: typography.sizes.xs,
      color: colors.primary,
      fontWeight: typography.weights.semibold,
    },
    deleteActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.xs + 3,
      paddingVertical: spacing.xs,
      borderRadius: spacing.borderRadius.sm,
      backgroundColor: colors.dangerLight,
    },
    deleteActionText: {
      fontSize: typography.sizes.xs,
      color: colors.danger,
      fontWeight: typography.weights.semibold,
    },
  });

export default PropertyRulesSection;
