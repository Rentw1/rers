import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useTheme } from '@/lib/theme';
import { settings } from '@/store/settings';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? c.text} style={style} />;
}

export function tap(): void {
  if (settings().haptics) void Haptics.selectionAsync();
}

type Variant = 'title' | 'h2' | 'body' | 'small' | 'caption' | 'mono' | 'label';

export function T({ children, v = 'body', color, style, numberOfLines, selectable, onPress }: { children: ReactNode; v?: Variant; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number; selectable?: boolean; onPress?: () => void }) {
  const { c, serif } = useTheme();
  const base: TextStyle = {
    title: { fontSize: 26, fontWeight: '600' as const, fontFamily: serif ? 'serif' : undefined, color: c.text },
    h2: { fontSize: 17, fontWeight: '600' as const, color: c.text },
    body: { fontSize: 16, lineHeight: 23, color: c.text },
    small: { fontSize: 14, lineHeight: 19, color: c.textMuted },
    caption: { fontSize: 12, lineHeight: 16, color: c.textFaint },
    mono: { fontSize: 13, lineHeight: 18, fontFamily: 'monospace', color: c.text },
    label: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: c.textMuted },
  }[v];
  return (
    <Text style={[base, color ? { color } : null, style]} numberOfLines={numberOfLines} selectable={selectable} onPress={onPress}>
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.accent : kind === 'danger' ? c.danger : kind === 'secondary' ? c.surfaceAlt : 'transparent';
  const fg = kind === 'primary' ? c.accentText : kind === 'danger' ? '#fff' : kind === 'ghost' ? c.accent : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: radius.md, paddingVertical: small ? 8 : 13, paddingHorizontal: small ? 12 : 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        kind === 'ghost' ? { borderWidth: 1, borderColor: c.border } : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: small ? 14 : 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ name, onPress, label, size = 22, color, disabled, style, onLongPress }: { name: IconName; onPress: () => void; label: string; size?: number; color?: string; disabled?: boolean; style?: StyleProp<ViewStyle>; onLongPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      disabled={disabled}
      onLongPress={onLongPress}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [{ padding: 8, borderRadius: 20, opacity: disabled ? 0.35 : 1, backgroundColor: pressed ? c.surfaceAlt : 'transparent' }, style]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Section({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: 22 }}>
      {title ? (
        <T v="label" style={{ marginBottom: 8, marginLeft: 4 }}>
          {title}
        </T>
      ) : null}
      <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, overflow: 'hidden' }}>{children}</View>
      {footer ? (
        <T v="caption" style={{ marginTop: 6, marginHorizontal: 6 }}>
          {footer}
        </T>
      ) : null}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  icon,
  right,
  onPress,
  chevron,
  danger,
  first,
  onLongPress,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
  first?: boolean;
  onLongPress?: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      disabled={!onPress && !onLongPress}
      onPress={onPress ? () => (tap(), onPress()) : undefined}
      onLongPress={onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12, backgroundColor: pressed ? c.surfaceAlt : 'transparent', borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: c.border })}
    >
      {icon ? <Icon name={icon} size={20} color={danger ? c.danger : c.textMuted} /> : null}
      <View style={{ flex: 1 }}>
        <T color={danger ? c.danger : undefined} numberOfLines={2}>
          {title}
        </T>
        {subtitle ? (
          <T v="small" numberOfLines={3} style={{ marginTop: 2 }}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-forward" size={18} color={c.textFaint} /> : null}
    </Pressable>
  );
}

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { c } = useTheme();
  return <Switch value={value} disabled={disabled} onValueChange={(v) => (tap(), onChange(v))} trackColor={{ true: c.accent, false: c.border }} thumbColor="#fff" />;
}

export function Field({ label, hint, style, ...props }: TextInputProps & { label?: string; hint?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <T v="small" style={{ marginBottom: 6, color: c.text, fontWeight: '500' }}>
          {label}
        </T>
      ) : null}
      <TextInput
        placeholderTextColor={c.textFaint}
        {...props}
        style={[{ backgroundColor: c.card, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: Platform.OS === 'android' ? 10 : 12, fontSize: 16, textAlignVertical: props.multiline ? 'top' : 'center' }, style]}
      />
      {hint ? (
        <T v="caption" style={{ marginTop: 5 }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Screen({ children, scroll = true, padded = true, keyboard = false }: { children: ReactNode; scroll?: boolean; padded?: boolean; keyboard?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const content = scroll ? (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: padded ? 16 : 0, paddingBottom: insets.bottom + 32 }}>
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding: padded ? 16 : 0, paddingBottom: padded ? insets.bottom + 16 : 0 }}>{children}</View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {keyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress ? () => (tap(), onPress()) : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? c.accent : c.surfaceAlt }}
    >
      {icon ? <Icon name={icon} size={14} color={active ? c.accentText : c.textMuted} /> : null}
      <Text style={{ color: active ? c.accentText : c.text, fontSize: 14, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning' }) {
  const { c } = useTheme();
  const color = { neutral: c.textMuted, accent: c.accent, success: c.success, danger: c.danger, warning: c.warning }[tone];
  return (
    <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: color }}>
      <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Banner({ text, tone = 'danger', action, onAction, onClose }: { text: string; tone?: 'danger' | 'warning' | 'info'; action?: string; onAction?: () => void; onClose?: () => void }) {
  const { c } = useTheme();
  const color = tone === 'danger' ? c.danger : tone === 'warning' ? c.warning : c.accent;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: color, backgroundColor: c.card, marginVertical: 8 }}>
      <Icon name={tone === 'info' ? 'information-circle-outline' : 'alert-circle-outline'} color={color} size={20} />
      <T v="small" style={{ flex: 1, color: c.text }} selectable>
        {text}
      </T>
      {action && onAction ? <Button small kind="ghost" title={action} onPress={onAction} /> : null}
      {onClose ? <IconButton name="close" label="Закрыть" size={18} onPress={onClose} /> : null}
    </View>
  );
}

export function Sheet({ visible, onClose, children, title, full }: { visible: boolean; onClose: () => void; children: ReactNode; title?: string; full?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (visible) Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    else anim.setValue(0);
  }, [visible, anim]);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} accessibilityLabel="Закрыть" />
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: full ? '92%' : '80%',
          minHeight: full ? '70%' : undefined,
          backgroundColor: c.bg,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingBottom: insets.bottom + 8,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }],
        }}
      >
        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.border }} />
        </View>
        {title ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
            <T v="h2" style={{ flex: 1 }}>
              {title}
            </T>
            <IconButton name="close" label="Закрыть" onPress={onClose} />
          </View>
        ) : null}
        {children}
      </Animated.View>
    </Modal>
  );
}

export function Empty({ icon, title, text, children }: { icon: IconName; title: string; text?: string; children?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 10 }}>
      <Icon name={icon} size={40} color={c.textFaint} />
      <T v="h2" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {text ? (
        <T v="small" style={{ textAlign: 'center' }}>
          {text}
        </T>
      ) : null}
      {children}
    </View>
  );
}

export function Loading() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}
