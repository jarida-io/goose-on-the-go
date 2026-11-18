/**
 * Every Pond setting the phone offers, lifted from pond-desktop's `settings/catalogue.ts`. Fields
 * nothing on the Pond reads are left out, as the desktop hides them, so no switch does nothing.
 */

import type { SettingsPage, SettingsPageId } from '@/models/pond-settings';

const assistant: SettingsPage = {
  id: 'assistant',
  icon: 'agent',
  tile: 'purple',
  titleKey: 'screens.settingsAssistant',
  descriptionKey: 'settings.page.assistant',
  sections: [
    {
      titleKey: 'settings.section.nameAndManner',
      items: [
        { kind: 'text', key: 'assistant_name', labelKey: 'settings.field.assistant_name.label', hintKey: 'settings.field.assistant_name.hint', placeholderKey: 'settings.field.assistant_name.placeholder' },
        { kind: 'text', key: 'assistant_personality', multiline: true, labelKey: 'settings.field.assistant_personality.label', hintKey: 'settings.field.assistant_personality.hint', placeholderKey: 'settings.field.assistant_personality.placeholder' },
      ],
    },
    {
      titleKey: 'settings.section.writingStyle',
      items: [
        {
          kind: 'choice',
          key: 'prompt_style',
          display: 'radio',
          labelKey: 'settings.field.prompt_style.label',
          options: [
            { value: 'balanced', labelKey: 'settings.option.prompt_style.balanced.label', hintKey: 'settings.option.prompt_style.balanced.hint' },
            { value: 'concise', labelKey: 'settings.option.prompt_style.concise.label', hintKey: 'settings.option.prompt_style.concise.hint' },
            { value: 'technical', labelKey: 'settings.option.prompt_style.technical.label', hintKey: 'settings.option.prompt_style.technical.hint' },
            { value: 'warm', labelKey: 'settings.option.prompt_style.warm.label', hintKey: 'settings.option.prompt_style.warm.hint' },
          ],
        },
      ],
    },
    {
      titleKey: 'settings.section.standingInstructions',
      footerKey: 'settings.footer.standingInstructions',
      items: [
        { kind: 'text', key: 'prompt_addendum', multiline: true, labelKey: 'settings.field.prompt_addendum.label', placeholderKey: 'settings.field.prompt_addendum.placeholder' },
        { kind: 'link', route: '/(stack)/settings-prompt-templates', icon: 'sparkle', tile: 'amber', labelKey: 'screens.settingsPromptTemplates' },
        { kind: 'link', route: '/(stack)/settings-prompt-notes', icon: 'prompts', tile: 'purple', labelKey: 'screens.settingsPromptNotes' },
      ],
    },
    {
      titleKey: 'settings.section.advanced',
      footerKey: 'settings.footer.customPrompt',
      items: [
        { kind: 'text', key: 'custom_system_prompt', multiline: true, nullable: true, labelKey: 'settings.field.custom_system_prompt.label', placeholderKey: 'settings.field.custom_system_prompt.placeholder' },
      ],
    },
  ],
};

const voice: SettingsPage = {
  id: 'voice',
  icon: 'voice',
  tile: 'pink',
  titleKey: 'screens.settingsVoice',
  descriptionKey: 'settings.page.voice',
  sections: [
    // The Voice agent answers everything said out loud; its page holds how it speaks and the room.
    {
      footerKey: 'settings.footer.voiceAgent',
      items: [{ kind: 'link', route: '/(stack)/voice-agent', icon: 'voice', tile: 'pink', labelKey: 'screens.voiceAgent' }],
    },
    // On this phone, not the Pond: Android's assist gesture opens Goose's voice orb over any app.
    {
      titleKey: 'settings.section.phoneAssistant',
      items: [{ kind: 'special', id: 'phoneAssistant' }],
    },
    // The speaking voice is a page of its own: its picker would otherwise be most of this one.
    {
      items: [
        { kind: 'link', route: '/(stack)/settings-speaking', icon: 'speaker', tile: 'pink', labelKey: 'screens.settingsSpeaking', summary: 'speaking' },
      ],
    },
    {
      titleKey: 'settings.section.wakeWord',
      footerKey: 'settings.footer.wakeWord',
      items: [
        { kind: 'link', route: '/(stack)/wake-word', icon: 'mic', tile: 'pink', labelKey: 'screens.wakeWord', summary: 'wakeWord' },
        { kind: 'text', key: 'voice_wake_word', restart: true, labelKey: 'settings.field.voice_wake_word.label', hintKey: 'settings.field.voice_wake_word.hint', placeholderKey: 'settings.field.voice_wake_word.placeholder' },
        { kind: 'special', id: 'wakeWordReset' },
      ],
    },
    {
      titleKey: 'settings.section.whileItAnswers',
      items: [
        { kind: 'switch', key: 'voice_thinking_tone_enabled', labelKey: 'settings.field.voice_thinking_tone_enabled.label', hintKey: 'settings.field.voice_thinking_tone_enabled.hint' },
        { kind: 'number', key: 'voice_max_turns', min: 0, max: 50, step: 1, labelKey: 'settings.field.voice_max_turns.label', hintKey: 'settings.field.voice_max_turns.hint' },
      ],
    },
    {
      items: [
        { kind: 'link', route: '/(stack)/settings-listening', icon: 'ear', tile: 'pink', labelKey: 'screens.settingsListening' },
      ],
    },
  ],
};

const speaking: SettingsPage = {
  id: 'speaking',
  icon: 'speaker',
  tile: 'pink',
  titleKey: 'screens.settingsSpeaking',
  descriptionKey: 'settings.page.speaking',
  sections: [
    // How a reply in the room is stopped comes first: it is what someone looks for here mid-reply.
    { titleKey: 'settings.section.inTheRoom', items: [{ kind: 'special', id: 'roomInterrupts' }] },
    // The picker carries the voice and its pace, as pond-desktop's does.
    { titleKey: 'settings.section.gooseVoice', items: [{ kind: 'special', id: 'voicePicker' }] },
    {
      titleKey: 'settings.section.soundQuality',
      footerKey: 'settings.footer.soundQuality',
      items: [
        {
          kind: 'choice',
          key: 'voice_tts_quality',
          display: 'radio',
          labelKey: 'settings.field.voice_tts_quality.label',
          options: [
            { value: 'q8', labelKey: 'settings.option.voice_tts_quality.q8.label', hintKey: 'settings.option.voice_tts_quality.q8.hint' },
            { value: 'q8f16', labelKey: 'settings.option.voice_tts_quality.q8f16.label', hintKey: 'settings.option.voice_tts_quality.q8f16.hint' },
            { value: 'q4f16', labelKey: 'settings.option.voice_tts_quality.q4f16.label', hintKey: 'settings.option.voice_tts_quality.q4f16.hint' },
            { value: 'fp16', labelKey: 'settings.option.voice_tts_quality.fp16.label', hintKey: 'settings.option.voice_tts_quality.fp16.hint' },
            { value: 'fp32', labelKey: 'settings.option.voice_tts_quality.fp32.label', hintKey: 'settings.option.voice_tts_quality.fp32.hint' },
          ],
        },
      ],
    },
  ],
};

const listening: SettingsPage = {
  id: 'listening',
  icon: 'ear',
  tile: 'pink',
  titleKey: 'screens.settingsListening',
  descriptionKey: 'settings.page.listening',
  sections: [
    {
      titleKey: 'settings.section.inTheRoom',
      items: [
        { kind: 'special', id: 'roomVoice' },
        // What the room listens for, so someone tuning how it listens can reach it from here.
        { kind: 'link', route: '/(stack)/wake-word', icon: 'mic', tile: 'pink', labelKey: 'screens.wakeWord', summary: 'wakeWord' },
      ],
    },
    {
      // Each of these tunes Whisper listening for the phrase; the "hey goose" detector reads none of them.
      titleKey: 'settings.section.whisperDetector',
      footerKey: 'settings.footer.whisperDetector',
      items: [
        { kind: 'number', key: 'voice_kws_energy_threshold', min: 0, max: 1, step: 0.001, restart: true, labelKey: 'settings.field.voice_kws_energy_threshold.label', hintKey: 'settings.field.voice_kws_energy_threshold.hint' },
        { kind: 'number', key: 'voice_kws_post_trigger_silence_ms', min: 0, step: 1, unitKey: 'settings.unit.ms', restart: true, labelKey: 'settings.field.voice_kws_post_trigger_silence_ms.label', hintKey: 'settings.field.voice_kws_post_trigger_silence_ms.hint' },
        { kind: 'number', key: 'voice_kws_cooldown_ms', min: 0, step: 1, unitKey: 'settings.unit.ms', restart: true, labelKey: 'settings.field.voice_kws_cooldown_ms.label', hintKey: 'settings.field.voice_kws_cooldown_ms.hint' },
        { kind: 'number', key: 'voice_recording_duration_secs', min: 1, max: 300, step: 1, unitKey: 'settings.unit.seconds', labelKey: 'settings.field.voice_recording_duration_secs.label', hintKey: 'settings.field.voice_recording_duration_secs.hint' },
      ],
    },
    {
      titleKey: 'settings.section.transcription',
      items: [
        { kind: 'text', key: 'voice_whisper_url', address: true, restart: true, labelKey: 'settings.field.voice_whisper_url.label', hintKey: 'settings.field.voice_whisper_url.hint', placeholderKey: 'settings.field.voice_whisper_url.placeholder' },
      ],
    },
  ],
};

const thinking: SettingsPage = {
  id: 'thinking',
  icon: 'sparkle',
  tile: 'indigo',
  titleKey: 'screens.settingsThinking',
  descriptionKey: 'settings.page.thinking',
  sections: [
    {
      titleKey: 'settings.section.beforeAnswering',
      items: [
        {
          kind: 'choice',
          key: 'thinking_mode',
          display: 'radio',
          labelKey: 'settings.field.thinking_mode.label',
          options: [
            { value: 'auto', labelKey: 'settings.option.thinking_mode.auto.label', hintKey: 'settings.option.thinking_mode.auto.hint' },
            { value: 'on', labelKey: 'settings.option.thinking_mode.on.label', hintKey: 'settings.option.thinking_mode.on.hint' },
            { value: 'off', labelKey: 'settings.option.thinking_mode.off.label', hintKey: 'settings.option.thinking_mode.off.hint' },
          ],
        },
      ],
    },
    {
      titleKey: 'settings.section.howLong',
      items: [
        {
          kind: 'choice',
          key: 'reasoning_effort',
          display: 'radio',
          labelKey: 'settings.field.reasoning_effort.label',
          options: [
            { value: 'brief', labelKey: 'settings.option.reasoning_effort.brief.label', hintKey: 'settings.option.reasoning_effort.brief.hint' },
            { value: 'balanced', labelKey: 'settings.option.reasoning_effort.balanced.label' },
            { value: 'thorough', labelKey: 'settings.option.reasoning_effort.thorough.label', hintKey: 'settings.option.reasoning_effort.thorough.hint' },
          ],
        },
      ],
    },
    {
      items: [
        { kind: 'switch', key: 'show_thinking', labelKey: 'settings.field.show_thinking.label', hintKey: 'settings.field.show_thinking.hint' },
        { kind: 'switch', key: 'persist_thinking', labelKey: 'settings.field.persist_thinking.label', hintKey: 'settings.field.persist_thinking.hint' },
        { kind: 'switch', key: 'goal_check_enabled', labelKey: 'settings.field.goal_check_enabled.label', hintKey: 'settings.field.goal_check_enabled.hint' },
      ],
    },
    {
      titleKey: 'settings.section.checkingAnswers',
      footerKey: 'settings.footer.restartReview',
      items: [
        {
          kind: 'choice',
          key: 'review_mode',
          display: 'radio',
          restart: true,
          labelKey: 'settings.field.review_mode.label',
          options: [
            { value: 'off', labelKey: 'settings.option.review_mode.off.label', hintKey: 'settings.option.review_mode.off.hint' },
            { value: 'auto', labelKey: 'settings.option.review_mode.auto.label', hintKey: 'settings.option.review_mode.auto.hint' },
            { value: 'on', labelKey: 'settings.option.review_mode.on.label', hintKey: 'settings.option.review_mode.on.hint' },
          ],
        },
        { kind: 'number', key: 'review_max_rounds', min: 0, max: 5, step: 1, restart: true, labelKey: 'settings.field.review_max_rounds.label', hintKey: 'settings.field.review_max_rounds.hint' },
        { kind: 'number', key: 'review_pass_threshold', min: 1, max: 5, step: 1, restart: true, labelKey: 'settings.field.review_pass_threshold.label', hintKey: 'settings.field.review_pass_threshold.hint' },
      ],
    },
  ],
};

const memory: SettingsPage = {
  id: 'memory',
  icon: 'memory',
  tile: 'teal',
  titleKey: 'screens.settingsMemory',
  descriptionKey: 'settings.page.memory',
  sections: [
    {
      items: [
        { kind: 'link', route: '/(stack)/memories', icon: 'memory', tile: 'teal', labelKey: 'settings.link.whatItRemembers' },
      ],
    },
    {
      titleKey: 'settings.section.remembering',
      items: [
        { kind: 'switch', key: 'memory_extraction_enabled', labelKey: 'settings.field.memory_extraction_enabled.label', hintKey: 'settings.field.memory_extraction_enabled.hint' },
        { kind: 'number', key: 'memory_extraction_max_facts', min: 0, max: 50, step: 1, labelKey: 'settings.field.memory_extraction_max_facts.label', hintKey: 'settings.field.memory_extraction_max_facts.hint' },
        { kind: 'switch', key: 'agent_memory_inject', labelKey: 'settings.field.agent_memory_inject.label', hintKey: 'settings.field.agent_memory_inject.hint' },
        { kind: 'number', key: 'agent_memory_limit', min: 0, max: 100, step: 1, labelKey: 'settings.field.agent_memory_limit.label', hintKey: 'settings.field.agent_memory_limit.hint' },
      ],
    },
    {
      titleKey: 'settings.section.forgetting',
      items: [
        { kind: 'switch', key: 'memory_cleanup_enabled', restart: true, labelKey: 'settings.field.memory_cleanup_enabled.label', hintKey: 'settings.field.memory_cleanup_enabled.hint' },
        { kind: 'number', key: 'memory_cleanup_interval_hours', min: 1, step: 1, unitKey: 'settings.unit.hours', restart: true, labelKey: 'settings.field.memory_cleanup_interval_hours.label' },
      ],
    },
    {
      titleKey: 'settings.section.tidyingUp',
      items: [
        { kind: 'switch', key: 'memory_consolidation_enabled', labelKey: 'settings.field.memory_consolidation_enabled.label', hintKey: 'settings.field.memory_consolidation_enabled.hint' },
        {
          kind: 'choice',
          key: 'memory_consolidation_mode',
          display: 'radio',
          labelKey: 'settings.field.memory_consolidation_mode.label',
          options: [
            { value: 'single', labelKey: 'settings.option.memory_consolidation_mode.single.label', hintKey: 'settings.option.memory_consolidation_mode.single.hint' },
            { value: 'adversarial', labelKey: 'settings.option.memory_consolidation_mode.adversarial.label', hintKey: 'settings.option.memory_consolidation_mode.adversarial.hint' },
          ],
        },
        { kind: 'number', key: 'memory_consolidation_interval_hours', min: 1, step: 1, unitKey: 'settings.unit.hours', labelKey: 'settings.field.memory_consolidation_interval_hours.label' },
        { kind: 'number', key: 'memory_consolidation_batch_size', min: 1, max: 1000, step: 1, labelKey: 'settings.field.memory_consolidation_batch_size.label' },
      ],
    },
    {
      items: [
        { kind: 'link', route: '/(stack)/settings-memory-tuning', icon: 'sliders', tile: 'teal', labelKey: 'screens.settingsMemoryTuning' },
      ],
    },
  ],
};

const memoryTuning: SettingsPage = {
  id: 'memoryTuning',
  icon: 'sliders',
  tile: 'teal',
  titleKey: 'screens.settingsMemoryTuning',
  descriptionKey: 'settings.page.memoryTuning',
  sections: [
    {
      titleKey: 'settings.section.reading',
      items: [
        { kind: 'number', key: 'memory_extraction_interval_secs', min: 0, step: 1, unitKey: 'settings.unit.seconds', labelKey: 'settings.field.memory_extraction_interval_secs.label', hintKey: 'settings.field.memory_extraction_interval_secs.hint' },
      ],
    },
    {
      titleKey: 'settings.section.fading',
      items: [
        { kind: 'number', key: 'memory_decay_base_half_life_days', min: 0, step: 0.25, unitKey: 'settings.unit.days', labelKey: 'settings.field.memory_decay_base_half_life_days.label', hintKey: 'settings.field.memory_decay_base_half_life_days.hint' },
        { kind: 'number', key: 'memory_decay_beta', min: 0, max: 10, step: 0.05, labelKey: 'settings.field.memory_decay_beta.label', hintKey: 'settings.field.memory_decay_beta.hint' },
        { kind: 'slider', key: 'memory_archive_threshold', min: 0, max: 1, step: 0.01, format: 'fraction', labelKey: 'settings.field.memory_archive_threshold.label', hintKey: 'settings.field.memory_archive_threshold.hint' },
        { kind: 'slider', key: 'memory_prune_threshold', min: 0, max: 1, step: 0.01, format: 'fraction', labelKey: 'settings.field.memory_prune_threshold.label', hintKey: 'settings.field.memory_prune_threshold.hint' },
      ],
    },
    {
      titleKey: 'settings.section.search',
      footerKey: 'settings.footer.embeddings',
      items: [
        {
          kind: 'toggle',
          key: 'embedding_provider',
          on: 'auto',
          off: 'none',
          labelKey: 'settings.field.embedding_provider.label',
          hintKey: 'settings.field.embedding_provider.hint',
        },
      ],
    },
  ],
};

const tools: SettingsPage = {
  id: 'tools',
  icon: 'skills',
  tile: 'orange',
  titleKey: 'screens.settingsTools',
  descriptionKey: 'settings.page.tools',
  sections: [
    {
      titleKey: 'settings.section.whatItCanUse',
      footerKey: 'settings.footer.restartTools',
      items: [
        { kind: 'switch', key: 'ext_memory_enabled', restart: true, labelKey: 'settings.field.ext_memory_enabled.label', hintKey: 'settings.field.ext_memory_enabled.hint' },
        { kind: 'switch', key: 'ext_schedule_enabled', restart: true, labelKey: 'settings.field.ext_schedule_enabled.label', hintKey: 'settings.field.ext_schedule_enabled.hint' },
        { kind: 'switch', key: 'ext_weather_enabled', restart: true, labelKey: 'settings.field.ext_weather_enabled.label', hintKey: 'settings.field.ext_weather_enabled.hint' },
        { kind: 'switch', key: 'ext_knowledge_enabled', restart: true, labelKey: 'settings.field.ext_knowledge_enabled.label', hintKey: 'settings.field.ext_knowledge_enabled.hint' },
        { kind: 'switch', key: 'ext_device_enabled', restart: true, labelKey: 'settings.field.ext_device_enabled.label', hintKey: 'settings.field.ext_device_enabled.hint' },
        { kind: 'switch', key: 'ext_sensor_enabled', restart: true, labelKey: 'settings.field.ext_sensor_enabled.label', hintKey: 'settings.field.ext_sensor_enabled.hint' },
        { kind: 'switch', key: 'ext_travel_enabled', restart: true, labelKey: 'settings.field.ext_travel_enabled.label', hintKey: 'settings.field.ext_travel_enabled.hint' },
        { kind: 'switch', key: 'ext_system_enabled', restart: true, labelKey: 'settings.field.ext_system_enabled.label', hintKey: 'settings.field.ext_system_enabled.hint' },
        { kind: 'switch', key: 'ext_orchestrator_enabled', restart: true, labelKey: 'settings.field.ext_orchestrator_enabled.label', hintKey: 'settings.field.ext_orchestrator_enabled.hint' },
        { kind: 'switch', key: 'ext_context_enabled', restart: true, labelKey: 'settings.field.ext_context_enabled.label', hintKey: 'settings.field.ext_context_enabled.hint' },
      ],
    },
    {
      titleKey: 'settings.section.howToolsAreOffered',
      items: [
        {
          kind: 'choice',
          key: 'tool_selection_mode',
          display: 'radio',
          labelKey: 'settings.field.tool_selection_mode.label',
          options: [
            { value: 'all', labelKey: 'settings.option.tool_selection_mode.all.label', hintKey: 'settings.option.tool_selection_mode.all.hint' },
            { value: 'relevant', labelKey: 'settings.option.tool_selection_mode.relevant.label', hintKey: 'settings.option.tool_selection_mode.relevant.hint' },
            { value: 'minimal', labelKey: 'settings.option.tool_selection_mode.minimal.label', hintKey: 'settings.option.tool_selection_mode.minimal.hint' },
          ],
        },
      ],
    },
    {
      titleKey: 'settings.section.helpers',
      items: [
        { kind: 'special', id: 'toolModel' },
        { kind: 'text', key: 'searxng_url', address: true, nullable: true, labelKey: 'settings.field.searxng_url.label', hintKey: 'settings.field.searxng_url.hint', placeholderKey: 'settings.field.searxng_url.placeholder' },
      ],
    },
    {
      items: [
        { kind: 'link', route: '/(stack)/extensions', icon: 'link', tile: 'orange', labelKey: 'screens.extensions', summary: 'extensions' },
        { kind: 'link', route: '/(stack)/web-search', icon: 'search', tile: 'blue', labelKey: 'screens.webSearch', summary: 'webSearch' },
        { kind: 'link', route: '/(stack)/secrets', icon: 'key', tile: 'slate', labelKey: 'screens.secrets' },
      ],
    },
  ],
};

const internet: SettingsPage = {
  id: 'internet',
  icon: 'globe',
  tile: 'blue',
  titleKey: 'screens.settingsInternet',
  descriptionKey: 'settings.page.internet',
  sections: [
    {
      titleKey: 'settings.section.reach',
      items: [
        {
          kind: 'choice',
          key: 'network_mode',
          display: 'radio',
          labelKey: 'settings.field.network_mode.label',
          options: [
            { value: 'open', labelKey: 'settings.option.network_mode.open.label', hintKey: 'settings.option.network_mode.open.hint' },
            { value: 'allowlist', labelKey: 'settings.option.network_mode.allowlist.label', hintKey: 'settings.option.network_mode.allowlist.hint' },
            { value: 'offline', labelKey: 'settings.option.network_mode.offline.label', hintKey: 'settings.option.network_mode.offline.hint' },
          ],
        },
      ],
    },
    {
      titleKey: 'settings.section.otherPonds',
      footerKey: 'settings.footer.mesh',
      items: [
        { kind: 'switch', key: 'mesh_enabled', labelKey: 'settings.field.mesh_enabled.label', hintKey: 'settings.field.mesh_enabled.hint' },
      ],
    },
  ],
};

const home: SettingsPage = {
  id: 'home',
  icon: 'home',
  tile: 'green',
  titleKey: 'screens.settingsHome',
  descriptionKey: 'settings.page.home',
  sections: [
    {
      items: [
        { kind: 'text', key: 'home_name', labelKey: 'settings.field.home_name.label', hintKey: 'settings.field.home_name.hint', placeholderKey: 'settings.field.home_name.placeholder' },
        { kind: 'special', id: 'timezone' },
      ],
    },
    {
      titleKey: 'settings.section.weather',
      footerKey: 'settings.footer.location',
      items: [
        { kind: 'special', id: 'location' },
        { kind: 'switch', key: 'weather_enabled', restart: true, labelKey: 'settings.field.weather_enabled.label', hintKey: 'settings.field.weather_enabled.hint' },
      ],
    },
    {
      titleKey: 'settings.section.exactPosition',
      footerKey: 'settings.footer.exactPosition',
      items: [
        { kind: 'number', key: 'weather_latitude', min: -90, max: 90, step: 0.0001, unitKey: 'settings.unit.degrees', restart: true, labelKey: 'settings.field.weather_latitude.label' },
        { kind: 'number', key: 'weather_longitude', min: -180, max: 180, step: 0.0001, unitKey: 'settings.unit.degrees', restart: true, labelKey: 'settings.field.weather_longitude.label' },
      ],
    },
    {
      items: [
        { kind: 'link', route: '/(stack)/settings-cameras', icon: 'camera', tile: 'slate', labelKey: 'screens.settingsCameras', summary: 'cameras' },
      ],
    },
  ],
};

/** Days a phone may go unseen, as the steppers offer them; 0 is never. */
const UNSEEN_PHONE_DAYS = [0, 7, 14, 30, 60, 90, 180, 365] as const;

const household: SettingsPage = {
  id: 'household',
  icon: 'users',
  tile: 'green',
  titleKey: 'screens.settingsHousehold',
  descriptionKey: 'settings.page.household',
  sections: [
    {
      titleKey: 'settings.section.you',
      items: [
        { kind: 'text', key: 'user_name', labelKey: 'settings.field.user_name.label', hintKey: 'settings.field.user_name.hint', placeholderKey: 'settings.field.user_name.placeholder' },
        { kind: 'special', id: 'primaryProfile' },
      ],
    },
    {
      titleKey: 'settings.section.inTheRoom',
      items: [
        { kind: 'switch', key: 'lone_voice_sets_reminders', labelKey: 'settings.field.lone_voice_sets_reminders.label', hintKey: 'settings.field.lone_voice_sets_reminders.hint' },
      ],
    },
    {
      items: [
        { kind: 'link', route: '/(stack)/add-users', icon: 'users', tile: 'green', labelKey: 'screens.addUsers', summary: 'people' },
        { kind: 'link', route: '/(stack)/home-management', icon: 'home', tile: 'green', labelKey: 'settings.link.rooms', summary: 'rooms' },
      ],
    },
  ],
};

const cameras: SettingsPage = {
  id: 'cameras',
  icon: 'camera',
  tile: 'slate',
  titleKey: 'screens.settingsCameras',
  descriptionKey: 'settings.page.cameras',
  sections: [
    // What the camera is doing right now comes before anything that sets it.
    { items: [{ kind: 'special', id: 'visionStatus' }] },
    {
      items: [
        { kind: 'link', route: '/(stack)/vision-events', icon: 'eye', tile: 'slate', labelKey: 'settings.link.visionEvents', summary: 'visionEvents' },
        { kind: 'link', route: '/(stack)/faces', icon: 'face', tile: 'indigo', labelKey: 'settings.link.faces', summary: 'faces' },
        { kind: 'link', route: '/(stack)/vision-automations', icon: 'bolt', tile: 'amber', labelKey: 'settings.link.visionAutomations', summary: 'visionAutomations' },
      ],
    },
    {
      titleKey: 'settings.section.camera',
      items: [
        { kind: 'switch', key: 'vision_enabled', labelKey: 'settings.field.vision_enabled.label', hintKey: 'settings.field.vision_enabled.hint' },
        { kind: 'switch', key: 'picture_support_download_enabled', labelKey: 'settings.field.picture_support_download_enabled.label', hintKey: 'settings.field.picture_support_download_enabled.hint' },
        { kind: 'text', key: 'vision_camera_url', address: true, labelKey: 'settings.field.vision_camera_url.label', hintKey: 'settings.field.vision_camera_url.hint', placeholderKey: 'settings.field.vision_camera_url.placeholder' },
        { kind: 'text', key: 'vision_camera_id', labelKey: 'settings.field.vision_camera_id.label', hintKey: 'settings.field.vision_camera_id.hint', placeholderKey: 'settings.field.vision_camera_id.placeholder' },
        { kind: 'number', key: 'vision_fps', min: 1, max: 30, step: 1, stops: [1, 2, 3, 5, 10, 15, 24, 30], unitKey: 'settings.unit.fps', labelKey: 'settings.field.vision_fps.label', hintKey: 'settings.field.vision_fps.hint' },
        { kind: 'slider', key: 'vision_motion_threshold', min: 0.01, max: 0.5, step: 0.01, format: 'fraction', labelKey: 'settings.field.vision_motion_threshold.label', hintKey: 'settings.field.vision_motion_threshold.hint' },
        // The contract's live list leaves the detector out, so a change still waits for a restart.
        { kind: 'text', key: 'vision_classifier_model', restart: true, labelKey: 'settings.field.vision_classifier_model.label', hintKey: 'settings.field.vision_classifier_model.hint', placeholderKey: 'settings.field.vision_classifier_model.placeholder' },
      ],
    },
    {
      titleKey: 'settings.section.watchesFor',
      footerKey: 'settings.footer.watchesFor',
      items: [
        { kind: 'special', id: 'visionEventTypes' },
        { kind: 'number', key: 'vision_event_cooldown_secs', min: 1, max: 3600, step: 1, unitKey: 'settings.unit.seconds', labelKey: 'settings.field.vision_event_cooldown_secs.label', hintKey: 'settings.field.vision_event_cooldown_secs.hint' },
        { kind: 'slider', key: 'vision_classifier_confidence', min: 0.05, max: 0.99, step: 0.01, format: 'fraction', labelKey: 'settings.field.vision_classifier_confidence.label', hintKey: 'settings.field.vision_classifier_confidence.hint' },
      ],
    },
    {
      titleKey: 'settings.section.faces',
      footerKey: 'settings.footer.faces',
      items: [
        { kind: 'switch', key: 'vision_face_recognition_enabled', labelKey: 'settings.field.vision_face_recognition_enabled.label', hintKey: 'settings.field.vision_face_recognition_enabled.hint' },
        { kind: 'switch', key: 'vision_face_on_motion', labelKey: 'settings.field.vision_face_on_motion.label', hintKey: 'settings.field.vision_face_on_motion.hint' },
      ],
    },
    {
      titleKey: 'settings.section.smartHome',
      items: [
        { kind: 'text', key: 'matter_ws_url', address: true, labelKey: 'settings.field.matter_ws_url.label', hintKey: 'settings.field.matter_ws_url.hint', placeholderKey: 'settings.field.matter_ws_url.placeholder' },
        { kind: 'switch', key: 'matter_ble_enabled', labelKey: 'settings.field.matter_ble_enabled.label', hintKey: 'settings.field.matter_ble_enabled.hint' },
      ],
    },
  ],
};

const announcements: SettingsPage = {
  id: 'announcements',
  icon: 'bell',
  tile: 'red',
  titleKey: 'screens.settingsAnnouncements',
  descriptionKey: 'settings.page.announcements',
  sections: [
    {
      titleKey: 'settings.section.speakingUp',
      items: [
        { kind: 'switch', key: 'unprompted_speech_enabled', labelKey: 'settings.field.unprompted_speech_enabled.label', hintKey: 'settings.field.unprompted_speech_enabled.hint' },
        { kind: 'special', id: 'speechCategories' },
      ],
    },
    {
      titleKey: 'settings.section.quietHours',
      footerKey: 'settings.footer.quietHours',
      items: [
        { kind: 'time', key: 'quiet_hours_start', labelKey: 'settings.field.quiet_hours_start.label' },
        { kind: 'time', key: 'quiet_hours_end', labelKey: 'settings.field.quiet_hours_end.label' },
        { kind: 'switch', key: 'notices_wait_in_quiet_hours', labelKey: 'settings.field.notices_wait_in_quiet_hours.label', hintKey: 'settings.field.notices_wait_in_quiet_hours.hint' },
      ],
    },
    {
      titleKey: 'settings.section.phones',
      items: [
        { kind: 'switch', key: 'speak_unfetched_reminders', labelKey: 'settings.field.speak_unfetched_reminders.label', hintKey: 'settings.field.speak_unfetched_reminders.hint' },
        { kind: 'number', key: 'unseen_phone_skip_days', min: 0, max: 365, step: 1, stops: UNSEEN_PHONE_DAYS, unitKey: 'settings.unit.days', labelKey: 'settings.field.unseen_phone_skip_days.label', hintKey: 'settings.field.unseen_phone_skip_days.hint' },
        { kind: 'number', key: 'unseen_phone_remove_days', min: 0, max: 365, step: 1, stops: UNSEEN_PHONE_DAYS, unitKey: 'settings.unit.days', labelKey: 'settings.field.unseen_phone_remove_days.label', hintKey: 'settings.field.unseen_phone_remove_days.hint' },
      ],
    },
    {
      titleKey: 'settings.section.onItsOwn',
      items: [
        { kind: 'switch', key: 'proactive_review_enabled', restart: true, labelKey: 'settings.field.proactive_review_enabled.label', hintKey: 'settings.field.proactive_review_enabled.hint' },
        { kind: 'switch', key: 'session_titling_enabled', labelKey: 'settings.field.session_titling_enabled.label', hintKey: 'settings.field.session_titling_enabled.hint' },
        { kind: 'special', id: 'retitle' },
      ],
    },
    {
      titleKey: 'settings.section.homeSuggestions',
      items: [
        { kind: 'list', key: 'suggestions_muted', emptyKey: 'settings.field.suggestions_muted.empty', labelKey: 'settings.field.suggestions_muted.label', hintKey: 'settings.field.suggestions_muted.hint' },
      ],
    },
    {
      titleKey: 'settings.section.schedules',
      items: [
        { kind: 'number', key: 'schedule_max_concurrent', min: 1, max: 32, step: 1, restart: true, labelKey: 'settings.field.schedule_max_concurrent.label', hintKey: 'settings.field.schedule_max_concurrent.hint' },
        { kind: 'number', key: 'schedule_max_runs_per_task', min: 0, max: 10000, step: 1, labelKey: 'settings.field.schedule_max_runs_per_task.label', hintKey: 'settings.field.schedule_max_runs_per_task.hint' },
      ],
    },
  ],
};

const privacy: SettingsPage = {
  id: 'privacy',
  icon: 'shield',
  tile: 'blue',
  titleKey: 'screens.settingsPrivacy',
  descriptionKey: 'settings.page.privacy',
  sections: [
    { items: [{ kind: 'special', id: 'posture' }] },
    {
      titleKey: 'settings.section.sensors',
      items: [
        { kind: 'switch', key: 'mic_enabled', labelKey: 'settings.field.mic_enabled.label', hintKey: 'settings.field.mic_enabled.hint' },
        { kind: 'switch', key: 'cameras_enabled', labelKey: 'settings.field.cameras_enabled.label', hintKey: 'settings.field.cameras_enabled.hint' },
        { kind: 'switch', key: 'context_ingest_enabled', labelKey: 'settings.field.context_ingest_enabled.label', hintKey: 'settings.field.context_ingest_enabled.hint' },
      ],
    },
    {
      titleKey: 'settings.section.permissionChecks',
      items: [
        {
          kind: 'choice',
          key: 'security_policy_mode',
          display: 'radio',
          labelKey: 'settings.field.security_policy_mode.label',
          options: [
            { value: 'audit', labelKey: 'settings.option.security_policy_mode.audit.label', hintKey: 'settings.option.security_policy_mode.audit.hint' },
            { value: 'enforce', labelKey: 'settings.option.security_policy_mode.enforce.label', hintKey: 'settings.option.security_policy_mode.enforce.hint' },
            { value: 'off', labelKey: 'settings.option.security_policy_mode.off.label', hintKey: 'settings.option.security_policy_mode.off.hint' },
          ],
        },
      ],
    },
    {
      titleKey: 'settings.section.records',
      items: [
        { kind: 'switch', key: 'telemetry_enabled', labelKey: 'settings.field.telemetry_enabled.label', hintKey: 'settings.field.telemetry_enabled.hint' },
        { kind: 'link', route: '/(stack)/settings-retention', icon: 'archive', tile: 'slate', labelKey: 'screens.settingsRetention', summary: 'retention' },
        { kind: 'link', route: '/(stack)/settings-internet', icon: 'globe', tile: 'blue', labelKey: 'screens.settingsInternet', summary: 'internet' },
      ],
    },
    {
      items: [
        { kind: 'link', route: '/(stack)/privacy', icon: 'info', tile: 'slate', labelKey: 'screens.privacy' },
      ],
    },
  ],
};

const retention: SettingsPage = {
  id: 'retention',
  icon: 'archive',
  tile: 'slate',
  titleKey: 'screens.settingsRetention',
  descriptionKey: 'settings.page.retention',
  sections: [
    {
      titleKey: 'settings.section.howLongThingsAreKept',
      footerKey: 'settings.footer.retention',
      items: [
        { kind: 'number', key: 'retention_event_log_days', min: 0, step: 1, unitKey: 'settings.unit.days', labelKey: 'settings.field.retention_event_log_days.label', hintKey: 'settings.field.retention_event_log_days.hint' },
        { kind: 'number', key: 'retention_events_days', min: 0, step: 1, unitKey: 'settings.unit.days', labelKey: 'settings.field.retention_events_days.label', hintKey: 'settings.field.retention_events_days.hint' },
        { kind: 'number', key: 'retention_sensor_days', min: 0, step: 1, unitKey: 'settings.unit.days', labelKey: 'settings.field.retention_sensor_days.label' },
        { kind: 'number', key: 'retention_sensitive_days', min: 0, step: 1, unitKey: 'settings.unit.days', labelKey: 'settings.field.retention_sensitive_days.label', hintKey: 'settings.field.retention_sensitive_days.hint' },
        { kind: 'number', key: 'retention_session_messages_keep', min: 0, step: 1, unitKey: 'settings.unit.messages', labelKey: 'settings.field.retention_session_messages_keep.label' },
      ],
    },
    {
      titleKey: 'settings.section.byKind',
      items: [{ kind: 'special', id: 'retentionOverrides' }],
    },
  ],
};

const appearance: SettingsPage = {
  id: 'appearance',
  icon: 'palette',
  tile: 'slate',
  titleKey: 'screens.settingsAppearance',
  descriptionKey: 'settings.page.appearance',
  sections: [
    { items: [{ kind: 'special', id: 'theme' }] },
    { footerKey: 'settings.footer.haptics', items: [{ kind: 'special', id: 'haptics' }] },
  ],
};

/** How this phone hears from its Pond while the app is closed. Stored on the phone, not the Pond. */
const phoneNotifications: SettingsPage = {
  id: 'phoneNotifications',
  icon: 'bell',
  tile: 'red',
  titleKey: 'screens.settingsPhoneNotifications',
  descriptionKey: 'settings.page.phoneNotifications',
  sections: [
    { footerKey: 'settings.footer.stayConnected', items: [{ kind: 'special', id: 'stayConnected' }] },
    { footerKey: 'settings.footer.replyNotices', items: [{ kind: 'special', id: 'replyNotices' }] },
  ],
};

const advanced: SettingsPage = {
  id: 'advanced',
  icon: 'sliders',
  tile: 'slate',
  titleKey: 'screens.settingsAdvanced',
  descriptionKey: 'settings.page.advanced',
  sections: [
    {
      titleKey: 'settings.section.replies',
      items: [
        { kind: 'slider', key: 'llm_temperature', min: 0, max: 2, step: 0.05, format: 'creativity', labelKey: 'settings.field.llm_temperature.label', hintKey: 'settings.field.llm_temperature.hint' },
        { kind: 'number', key: 'llm_max_tokens', min: 1, max: 1000000, step: 1, unitKey: 'settings.unit.tokens', labelKey: 'settings.field.llm_max_tokens.label', hintKey: 'settings.field.llm_max_tokens.hint' },
        { kind: 'number', key: 'context_window_override', min: 0, max: 1048576, step: 1, unitKey: 'settings.unit.tokens', labelKey: 'settings.field.context_window_override.label', hintKey: 'settings.field.context_window_override.hint' },
      ],
    },
    {
      titleKey: 'settings.section.stepsAndTime',
      items: [
        { kind: 'number', key: 'agent_max_turns', min: 1, max: 500, step: 1, labelKey: 'settings.field.agent_max_turns.label', hintKey: 'settings.field.agent_max_turns.hint' },
        { kind: 'number', key: 'agent_timeout_secs', min: 0, step: 1, unitKey: 'settings.unit.seconds', labelKey: 'settings.field.agent_timeout_secs.label', hintKey: 'settings.field.agent_timeout_secs.hint' },
        { kind: 'switch', key: 'prefix_cache_prompt', labelKey: 'settings.field.prefix_cache_prompt.label', hintKey: 'settings.field.prefix_cache_prompt.hint' },
      ],
    },
    {
      titleKey: 'settings.section.longConversations',
      items: [
        { kind: 'switch', key: 'hybrid_compaction_enabled', labelKey: 'settings.field.hybrid_compaction_enabled.label', hintKey: 'settings.field.hybrid_compaction_enabled.hint' },
        { kind: 'number', key: 'summary_idle_secs', min: 0, step: 1, unitKey: 'settings.unit.seconds', labelKey: 'settings.field.summary_idle_secs.label', hintKey: 'settings.field.summary_idle_secs.hint' },
        { kind: 'number', key: 'compaction_verbatim_days', min: 0, step: 1, unitKey: 'settings.unit.days', labelKey: 'settings.field.compaction_verbatim_days.label', hintKey: 'settings.field.compaction_verbatim_days.hint' },
        { kind: 'switch', key: 'context_monitor_enabled', labelKey: 'settings.field.context_monitor_enabled.label', hintKey: 'settings.field.context_monitor_enabled.hint' },
        { kind: 'switch', key: 'show_turn_stats', labelKey: 'settings.field.show_turn_stats.label', hintKey: 'settings.field.show_turn_stats.hint' },
      ],
    },
    {
      titleKey: 'settings.section.engine',
      footerKey: 'settings.footer.engine',
      items: [
        { kind: 'special', id: 'chatProvider' },
        { kind: 'special', id: 'llmProvider' },
      ],
    },
    {
      titleKey: 'settings.section.costComparison',
      footerKey: 'settings.footer.cost',
      items: [
        { kind: 'number', key: 'cloud_input_price_per_million', min: 0, step: 0.01, unitKey: 'settings.unit.perMillion', labelKey: 'settings.field.cloud_input_price_per_million.label' },
        { kind: 'number', key: 'cloud_output_price_per_million', min: 0, step: 0.01, unitKey: 'settings.unit.perMillion', labelKey: 'settings.field.cloud_output_price_per_million.label' },
      ],
    },
    // Drawn only on a Jarida test Pond; a home Pond shows nothing here.
    { items: [{ kind: 'special', id: 'debugScreen' }] },
  ],
};

export const SETTINGS_PAGES: Record<SettingsPageId, SettingsPage> = {
  assistant,
  voice,
  speaking,
  listening,
  thinking,
  memory,
  memoryTuning,
  tools,
  internet,
  home,
  household,
  cameras,
  announcements,
  privacy,
  retention,
  appearance,
  phoneNotifications,
  advanced,
};
