/**
 * Jarida UI — Barrel Export
 *
 * Re-exports every primitive UI component from components/ui/.
 * Import individual components for tree-shaking, or pull from
 * this barrel for convenience:
 *
 *   import { GButton, GCard, GChip } from '@/components/ui';
 */

export { GIcon, type GIconProps } from './g-icon';
export { GButton, type GButtonProps, type GButtonVariant, type GButtonSize } from './g-button';
export { GCard, type GCardProps, type GCardVariant } from './g-card';
export { GChip, type GChipProps, type GChipVariant, type GChipSize } from './g-chip';
export { GInput, type GInputProps, type GInputVariant } from './g-input';
export { GSeparator, type GSeparatorProps } from './g-separator';
export { GTabs, type GTabsProps, type GTabItem, type GTabsVariant } from './g-tabs';
export { GTextArea, type GTextAreaProps, type GTextAreaVariant } from './g-text-area';
export { GRadioGroup, type GRadioGroupProps, type GRadioOption, type GRadioOrientation } from './g-radio-group';
export { GSlider, type GSliderProps } from './g-slider';
export { GProgressBar, type GProgressBarProps, type GProgressBarColor, type GProgressBarSize } from './g-progress-bar';
export { GSelect, type GSelectProps, type GSelectOption } from './g-select';
