/**
 * Jarida UI — Barrel Export
 *
 * Re-exports every primitive UI component from components/ui/.
 * Import individual components for tree-shaking, or pull from
 * this barrel for convenience:
 *
 *   import { GIcon } from '@/components/ui';
 *
 * Every other primitive has been migrated to `@jarida/ink/native`
 * (issue #17) — import those directly, e.g. `InkButton` from
 * '@jarida/ink/native'. `GIcon` is the one remaining exception,
 * tracked by a separate icon-registry issue.
 */

export { GIcon, type GIconProps } from './g-icon';
