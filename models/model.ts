/** AI Model types — Goose On The Go v2 design */

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  badge: string;
  badgeColor: string;
  description: string;
  speed: number;
  quality: number;
  privacy: number;
}

export const AI_MODELS: AIModel[] = [
  { id: 'goose-2', name: 'Goose 2', provider: 'Jarida', badge: 'Default', badgeColor: '#7C3AED', description: 'Optimized for home automation and personal tasks. Runs on-device via Pond.', speed: 5, quality: 4, privacy: 5 },
  { id: 'goose-pro', name: 'Goose Pro', provider: 'Jarida Cloud', badge: 'Recommended', badgeColor: '#1F8A3C', description: 'Full-power model with enhanced reasoning. Cloud-assisted via Jarida servers.', speed: 3, quality: 5, privacy: 4 },
  { id: 'claude-haiku', name: 'Claude Haiku', provider: 'Anthropic', badge: 'Fast', badgeColor: '#1C63D1', description: 'Lightweight and fast. Great for quick answers and device control.', speed: 5, quality: 3, privacy: 3 },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', badge: 'Powerful', badgeColor: '#10A37F', description: 'Broad capabilities, multimodal support. Requires OpenAI API key.', speed: 3, quality: 5, privacy: 2 },
];
