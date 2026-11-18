// News written from the member's interests: the feed, one story, the digest and its audio, the
// history, one interest's page, and the settings (docs/MY-GOOSE-HUB.md, part 2).

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Interest } from '@/models/interests';
import type { Digest, DigestSummary, NewsFeed, NewsSettings, Story, StoryDetail } from '@/models/news';
import i18n from '@/services/i18n';
import { showSnackbar } from '@/services/snackbar';
import type { NewsSettingsWire, StoryVoteWire } from '@/services/types';
import { cacheFile, discardFile, playFile } from '@/services/voice-io';
import { api } from '@/services/api-client';
import { useServer } from '@/providers/server-provider';
import { copyText } from '@/services/clipboard';
import { hubAction, useHubRead } from './hub-read';
import { useHubSource } from './hub-source';
import { logFailure } from './describe-error';

/** While the Pond is writing, the feed is read every few seconds; otherwise a few times an hour. */
export const NEWS_WRITING_MS = 5_000;
export const NEWS_MS = 10 * 60_000;

const EMPTY_FEED: NewsFeed = { stories: [], digest: null, state: 'idle', nextDigestAt: null, lastWrittenAt: null, blocked: null };

export function useNews(enabled = true) {
  const feed = useHubRead<NewsFeed>('news', (s) => s.news(), EMPTY_FEED, (d) => (d.state === 'writing' ? NEWS_WRITING_MS : NEWS_MS), enabled);
  const { source, setData } = feed;

  const refreshNews = useCallback(async () => {
    const done = await hubAction('news', () => source.refreshNews(), { retry: true });
    if (done === null) return;
    setData((d) => ({ ...d, state: 'writing' }));
    showSnackbar({ message: i18n.t('goose.news.writing'), tone: 'neutral' });
  }, [source, setData]);

  return { ...feed, actions: { reload: feed.reload, refreshNews } };
}

/** One interest's page: its own stories, newest first. */
export function useInterestNews(interestId: string) {
  return useHubRead<NewsFeed>(`news:${interestId}`, (s) => s.newsFor(interestId), EMPTY_FEED, NEWS_MS, !!interestId);
}

export function useNewsHistory() {
  return useHubRead<Story[]>('news-history', (s) => s.newsHistory(), [], NEWS_MS);
}

export function useStory(id: string) {
  const story = useHubRead<StoryDetail | null>(`story:${id}`, (s) => s.story(id), null, 30 * 60_000, !!id);
  const { source, data } = story;
  const { isScreenReal } = useServer();
  // Saved cards are not a hub route; the mock member keeps nothing, and says it did.
  const real = isScreenReal('myGoose');
  const [vote, setVote] = useState<StoryVoteWire | null>(null);
  const marked = useRef<string | null>(null);

  // Read once it is open: the history and the Pond's sense of what the member reads both hang on it.
  useEffect(() => {
    if (!data || marked.current === data.id) return;
    marked.current = data.id;
    source.markStoryRead(data.id).catch((e: unknown) => logFailure('story', 'mark read failed', e));
  }, [data, source]);

  const feedback = useCallback(
    async (next: StoryVoteWire, note?: string) => {
      if (!data) return false;
      const before = vote;
      setVote(next);
      const done = await hubAction('story', () => source.storyFeedback(data.id, next, note));
      if (done === null) {
        setVote(before);
        return false;
      }
      showSnackbar({ message: i18n.t(next === 'wrong' ? 'goose.story.wrongSent' : 'goose.story.voteSent'), tone: 'success' });
      return true;
    },
    [data, source, vote],
  );

  /** Keeps the story among the member's saved cards, as a note with its summary and sources. */
  const save = useCallback(async () => {
    if (!data) return;
    const done = await hubAction('story', async () =>
      !real ? true : api.saveItem({
        kind: 'note',
        title: data.headline,
        body: data.summary || data.dek,
        collection: i18n.t('goose.saved.storiesCollection'),
        sources: data.sources.map((s) => ({ title: s.title, url: s.url })),
      }),
    );
    if (done) showSnackbar({ message: i18n.t('goose.story.saved'), tone: 'success' });
  }, [data, real]);

  const follow = useCallback(
    async (interest: Pick<Interest, 'id'>, on: boolean) => {
      const done = await hubAction('story', () => source.editInterest(interest.id, { news: on ? 'tiles' : 'off' }));
      if (done) showSnackbar({ message: i18n.t(on ? 'goose.story.following' : 'goose.story.unfollowed', { topic: done.topic }), tone: 'success' });
      return done;
    },
    [source],
  );

  const never = useCallback(
    async (interestId: string) => {
      const done = await hubAction('story', () => source.editInterest(interestId, { avoid: true }));
      if (done) showSnackbar({ message: i18n.t('goose.story.neverShown', { topic: done.topic }), tone: 'success' });
      return done;
    },
    [source],
  );

  return { ...story, vote, actions: { reload: story.reload, feedback, save, follow, never } };
}

/**
 * What the "..." on any story can do, by story: save it, copy its link, follow or stop following
 * its interest, never see the interest again, or say the summary is wrong.
 */
export function useStoryActions() {
  const source = useHubSource();
  const { isScreenReal } = useServer();
  const real = isScreenReal('myGoose');

  const save = useCallback(
    async (story: Story, body?: string, sources?: { title: string; url: string }[]) => {
      const done = await hubAction('story', async () =>
        !real
          ? true
          : api.saveItem({
              kind: 'note',
              title: story.headline,
              body: body || story.dek,
              collection: i18n.t('goose.saved.storiesCollection'),
              sources: sources ?? (story.source.url ? [{ title: story.source.name, url: story.source.url }] : []),
            }),
      );
      if (done) showSnackbar({ message: i18n.t('goose.story.saved'), tone: 'success' });
    },
    [real],
  );

  const copyLink = useCallback(async (story: Story) => {
    if (!story.source.url) return;
    const done = await copyText(story.source.url);
    if (done === 'copied') showSnackbar({ message: i18n.t('goose.story.linkCopied'), tone: 'success' });
  }, []);

  const follow = useCallback(
    async (interestId: string, on: boolean) => {
      const done = await hubAction('story', () => source.editInterest(interestId, { news: on ? 'tiles' : 'off' }));
      if (done) showSnackbar({ message: i18n.t(on ? 'goose.story.following' : 'goose.story.unfollowed', { topic: done.topic }), tone: 'success' });
      return done;
    },
    [source],
  );

  const never = useCallback(
    async (interestId: string) => {
      const done = await hubAction('story', () => source.editInterest(interestId, { avoid: true }));
      if (done) showSnackbar({ message: i18n.t('goose.story.neverShown', { topic: done.topic }), tone: 'success' });
      return done;
    },
    [source],
  );

  const wrong = useCallback(
    async (story: Story, note?: string) => {
      const done = await hubAction('story', () => source.storyFeedback(story.id, 'wrong', note?.trim() || undefined));
      if (done !== null) showSnackbar({ message: i18n.t('goose.story.wrongSent'), tone: 'success' });
      return done !== null;
    },
    [source],
  );

  return { save, copyLink, follow, never, wrong };
}

export type StoryActions = ReturnType<typeof useStoryActions>;

export function useDigest(id: string) {
  return useHubRead<Digest | null>(`digest:${id}`, (s) => s.digest(id), null, 30 * 60_000, !!id);
}

export function useDigests() {
  return useHubRead<DigestSummary[]>('digests', (s) => s.digests(), [], NEWS_MS);
}

export type ListenState = 'idle' | 'loading' | 'playing';

/**
 * Listen on the phone: the digest's audio, fetched with the member's token, written to the cache,
 * and played to its end. Stopping, or leaving the screen, stops it and drops the file.
 */
const digestAudioCache = new Map<string, string>();

export function useListen() {
  const source = useHubSource();
  const [state, setState] = useState<ListenState>('idle');
  const playing = useRef<{ stop: () => void; uri: string } | null>(null);
  const aborter = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    aborter.current?.abort();
    aborter.current = null;
    const current = playing.current;
    playing.current = null;
    if (current) {
      current.stop();
    }
    setState('idle');
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(
    async (path: string) => {
      stop();
      setState('loading');
      const abort = new AbortController();
      aborter.current = abort;
      try {
        let uri = digestAudioCache.get(path);
        if (!uri) {
          const bytes = await source.digestAudio(path, abort.signal);
          if (abort.signal.aborted) return;
          uri = cacheFile('digest', new Uint8Array(bytes));
          digestAudioCache.set(path, uri);
        }
        const player = playFile(uri, () => {});
        playing.current = { stop: player.stop, uri };
        setState('playing');
        await player.done;
        if (playing.current?.uri === uri) {
          playing.current = null;
          setState('idle');
        }
      } catch (e) {
        if (abort.signal.aborted) return;
        logFailure('listen', 'digest audio failed', e);
        setState('idle');
        showSnackbar({ message: i18n.t('goose.digest.listenFailed'), tone: 'danger' });
      }
    },
    [source, stop],
  );

  return { state, play, stop };
}

/** "Play on the speaker": the Pond reads the digest in the room now. */
export function useSpeakDigest() {
  const source = useHubSource();
  const [asking, setAsking] = useState(false);
  const speak = useCallback(
    async (digestId: string) => {
      setAsking(true);
      const done = await hubAction('digest', () => source.speakDigest(digestId), { retry: true });
      setAsking(false);
      if (done !== null) showSnackbar({ message: i18n.t('goose.digest.speaking'), tone: 'success' });
    },
    [source],
  );
  return { asking, speak };
}

const DEFAULT_SETTINGS: NewsSettings = { digest: false, digestTime: '07:00', spokenOnSpeaker: false, tiles: false, timezone: '' };

export function useNewsSettings() {
  const settings = useHubRead<NewsSettings>('news-settings', (s) => s.newsSettings(), DEFAULT_SETTINGS, 30 * 60_000);
  const { source, setData, data } = settings;

  /** Each change is sent alone, as made; a refusal puts the old value back. */
  const save = useCallback(
    async (change: Partial<NewsSettingsWire>) => {
      const before = data;
      setData({
        ...before,
        ...(change.digest !== undefined ? { digest: change.digest } : {}),
        ...(change.digest_time !== undefined ? { digestTime: change.digest_time } : {}),
        ...(change.spoken_on_speaker !== undefined ? { spokenOnSpeaker: change.spoken_on_speaker } : {}),
        ...(change.tiles !== undefined ? { tiles: change.tiles } : {}),
      });
      const saved = await hubAction('news-settings', () => source.saveNewsSettings(change));
      setData(saved ?? before);
    },
    [data, setData, source],
  );

  return { ...settings, actions: { reload: settings.reload, save } };
}
