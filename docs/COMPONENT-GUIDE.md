# Component Guide

How to add, modify, and remove components in the Goose on The Go UI library.

## Component Types

| Type | Location | Naming | Purpose |
|------|----------|--------|---------|
| **Primitive** | `components/ui/` | `g-*.tsx` (GButton, GCard) | Basic building blocks. No business logic. |
| **Pattern** | `components/patterns/` | descriptive (chat-bubble, device-card) | Composed from primitives. Domain-aware. |
| **Layout** | `components/layout/` | descriptive (screen-scroll-view) | Screen wrappers and containers. |

## Adding a New Primitive Component

1. **Create the file** in `components/ui/` with kebab-case naming:
   ```
   components/ui/g-avatar.tsx
   ```

2. **Follow the prop pattern:**
   ```tsx
   interface GAvatarProps {
     variant?: 'default' | 'branded';
     size?: 'sm' | 'md' | 'lg';
     style?: ViewStyle;
     testID?: string;
   }
   ```

3. **Use StyleSheet.create()** for all styles — no inline objects.

4. **Import tokens** from individual constant files:
   ```tsx
   import { JaridaPurple, Grey } from '@/constants/colors';
   import { FontFamily, FontSize } from '@/constants/typography';
   import { Spacing } from '@/constants/spacing';
   import { Radii } from '@/constants/radii';
   ```

5. **Add haptic feedback** for pressable components:
   ```tsx
   import { useHaptics } from '@/hooks/use-haptics';
   const haptics = useHaptics();
   // In onPress: haptics.light();
   ```

6. **Wrap with React.memo** if it's a leaf/list component:
   ```tsx
   export const GAvatar = React.memo(function GAvatar(props: GAvatarProps) { ... });
   ```

7. **Export from barrel** in `components/ui/index.ts`:
   ```tsx
   export { GAvatar } from './g-avatar';
   ```

## Adding a New Pattern Component

1. **Create the file** in `components/patterns/`:
   ```
   components/patterns/notification-card.tsx
   ```

2. **Compose from primitives** — import from `@/components/ui`:
   ```tsx
   import { GCard, GChip, GButton } from '@/components/ui';
   ```

3. **Props should mirror ViewModel data shapes:**
   ```tsx
   interface NotificationCardProps {
     notification: Notification;  // from models/
     onDismiss: () => void;       // from ViewModel actions
   }
   ```

4. **Use React.memo** for list items.

## Modifying a Component

1. Read the component and understand its current props/variants.
2. Add new variants or props — don't break existing API.
3. Update the barrel export if the component name or export changed.

## Removing a Component

1. Search for imports across the codebase:
   ```bash
   grep -r "ComponentName" app/ components/ --include="*.tsx"
   ```
2. Remove or replace all usages.
3. Remove from the barrel export (`components/ui/index.ts`).
4. Delete the file.

## Adding a New Screen

1. **Create model types** in `models/` if needed.
2. **Create ViewModel** in `view-models/use-screen-name.ts`.
3. **Create pattern components** in `components/patterns/` as needed.
4. **Create screen file:**
   - Tab screen: `app/(tabs)/screen-name.tsx`
   - Stack screen: `app/(stack)/screen-name.tsx`
5. **Register the route:**
   - Tab: add to `app/(tabs)/_layout.tsx`
   - Stack: add to `app/(stack)/_layout.tsx`
6. **Add navigation entry** in `constants/navigation.ts` if it should appear in the More hub.

## Existing Components

### Primitives (components/ui/)
| Component | Props | Description |
|-----------|-------|-------------|
| GButton | variant, size, startIcon, endIcon, loading, disabled | Primary action button |
| GCard | variant (default/elevated) | Surface container |
| GChip | variant (6 colors), size, startIcon | Status badge |
| GIcon | name, size, color, fill | SVG icon from IconPaths registry |
| GInput | label, variant (bordered/flat), startIcon | Text input |
| GTextArea | label, variant, minLines, maxLines | Multi-line input |
| GTabs | tabs, activeKey, onTabChange, variant | Tab bar |
| GSeparator | — | Divider line |
| GRadioGroup | options, value, onValueChange, orientation | Radio options |
| GSlider | value, onValueChange, min, max, label | Range slider |
| GProgressBar | value, color, size, label | Progress indicator |
| GSelect | options, selectedKey, onSelectionChange, label | Modal picker |

`GSwitch`, `GSkeleton`, and `GEmptyState` have been replaced by
`@jarida/ink/native`'s `InkSwitch`, `InkSkeleton`, and `InkEmptyState`
(issue #17, phase 1 — leaf primitives). Import them directly from
`@jarida/ink/native` rather than `components/ui/` — those files are deleted
and won't be re-added. The remaining primitives above are scheduled for the
same migration in later phases; see issue #17 for the full mapping.

### Patterns (components/patterns/)
| Component | Props | Description |
|-----------|-------|-------------|
| PageHeader | title, action | Screen title bar |
| MetricCard | label, value, trend | Dashboard stat |
| QuickAction | label, onPress | Dashboard action row |
| ServerStatus | online, label | Connection indicator |
| RoleChip | role, model, color | Model assignment badge |
| ChatBubble | role, content, loading | Chat message |
| ChatComposer | onSend, placeholder | Message input |
| MoreMenuItem | label, onPress | More hub nav item |
| MemoryItem | text, date, onDelete | Memory list row |
| DeviceCard | device | Device display card |
| ScheduleCard | schedule, onToggle | Schedule display card |
| ModelItem | model, isActive, onPress | Model browser row |
| LogRow | log | Log entry row |
| SkillItem | skill, onToggle, onDelete | Skill list row |
| VoiceOrb | state, onPress | Voice mode button |
| VuMeter | level, active | Audio level bars |
