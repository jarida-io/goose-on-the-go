/**
 * Answering My Goose's questions from the notification itself: Done or Not yet when Goose asks
 * whether a to-do is done, Add or No when it offers a mention from a chat as a to-do, and Turn on
 * when it offers a specialist (the Budget offer, `agent_offer`).
 *
 * Each question is presented with a notification category whose buttons answer it without opening
 * the app. The answer reaches here from the response listener while the app runs, from the push
 * task on Android when it does not, or from the last response on the next launch, which can deliver
 * the same press twice; `answered` keeps it to once.
 */

import type { NotificationResponse } from 'expo-notifications';

import type { TodoAnswerWire } from './types';
import i18n from './i18n';
import { agentOfferFromData, todoPromptFromData, type AgentOffer, type TodoPrompt } from './notification-link';
import type { NotificationsModule } from './notifications-module';

export const CHECKIN_CATEGORY = 'todo_checkin';
export const OFFER_CATEGORY = 'todo_offer';
export const AGENT_OFFER_CATEGORY = 'agent_offer';

/** The buttons, by identifier. Kept apart from any other action this app may register. */
export const TODO_ACTIONS = {
  done: 'todo_done',
  notYet: 'todo_not_yet',
  add: 'todo_offer_add',
  no: 'todo_offer_no',
  turnOn: 'agent_turn_on',
} as const;

/** How long Not yet waits before Goose asks again, when answered from the notification. */
export const NOT_YET_FROM_NOTIFICATION_MINUTES = 120;

export interface TodoPromptClient {
  answerTodo(id: string, answer: TodoAnswerWire, snoozeMinutes?: number): Promise<unknown>;
  acceptTodoOffer(reminderId: string, dueAt?: string): Promise<unknown>;
  declineTodoOffer(reminderId: string): Promise<unknown>;
  setSpecialist(id: string, on: boolean): Promise<unknown>;
}

/** A question a notification's buttons answer. */
export type Prompt = TodoPrompt | AgentOffer;

export function promptFromData(data: unknown): Prompt | null {
  return todoPromptFromData(data) ?? agentOfferFromData(data);
}

/** Register the categories. Their buttons answer in the background: the member stays where they were. */
export async function registerTodoCategories(Notifications: NotificationsModule): Promise<void> {
  const quiet = { opensAppToForeground: false };
  await Notifications.setNotificationCategoryAsync(CHECKIN_CATEGORY, [
    { identifier: TODO_ACTIONS.done, buttonTitle: i18n.t('goose.notify.done'), options: quiet },
    { identifier: TODO_ACTIONS.notYet, buttonTitle: i18n.t('goose.notify.notYet'), options: quiet },
  ]);
  await Notifications.setNotificationCategoryAsync(OFFER_CATEGORY, [
    { identifier: TODO_ACTIONS.add, buttonTitle: i18n.t('goose.notify.add'), options: quiet },
    { identifier: TODO_ACTIONS.no, buttonTitle: i18n.t('goose.notify.no'), options: quiet },
  ]);
  await Notifications.setNotificationCategoryAsync(AGENT_OFFER_CATEGORY, [
    { identifier: TODO_ACTIONS.turnOn, buttonTitle: i18n.t('goose.notify.turnOn'), options: quiet },
  ]);
}

/** The category a notification carrying this data is shown with, or none. */
export function categoryFor(data: unknown): string | null {
  const prompt = promptFromData(data);
  if (!prompt) return null;
  switch (prompt.action) {
    case 'todo_checkin':
      return CHECKIN_CATEGORY;
    case 'todo_offer':
      return OFFER_CATEGORY;
    case 'agent_offer':
      return AGENT_OFFER_CATEGORY;
  }
}

/** The fields kept on the notification for its buttons, checked again when one is pressed. */
export function promptData(data: unknown): Record<string, string> {
  const prompt = promptFromData(data);
  if (!prompt) return {};
  switch (prompt.action) {
    case 'todo_checkin':
      return { action: prompt.action, todo_id: prompt.todoId, text: prompt.text };
    case 'todo_offer':
      return { action: prompt.action, reminder_id: prompt.reminderId, text: prompt.text, when_said: prompt.whenSaid };
    case 'agent_offer':
      return { action: prompt.action, agent: prompt.agent, label: prompt.label };
  }
}

const answered = new Set<string>();

/** For tests. */
export function resetAnsweredPrompts(): void {
  answered.clear();
}

type Answer = { prompt: Prompt; button: (typeof TODO_ACTIONS)[keyof typeof TODO_ACTIONS] };

function buttonsOf(prompt: Prompt): readonly Answer['button'][] {
  switch (prompt.action) {
    case 'todo_checkin':
      return [TODO_ACTIONS.done, TODO_ACTIONS.notYet];
    case 'todo_offer':
      return [TODO_ACTIONS.add, TODO_ACTIONS.no];
    case 'agent_offer':
      return [TODO_ACTIONS.turnOn];
  }
}

/** Which button of which question, from a response, or null when it is not one of ours. */
export function answerFrom(actionIdentifier: unknown, data: unknown): Answer | null {
  const button = Object.values(TODO_ACTIONS).find((a) => a === actionIdentifier);
  const prompt = promptFromData(data);
  if (!button || !prompt) return null;
  return buttonsOf(prompt).includes(button) ? { prompt, button } : null;
}

/**
 * Send the member's answer. Resolves whether it was sent (or had been already); a failure is
 * logged, never thrown, because the caller is a listener or a headless task.
 */
export async function sendAnswer(notificationId: string, answer: Answer, client: TodoPromptClient): Promise<boolean> {
  const key = `${notificationId}:${answer.button}`;
  if (answered.has(key)) return true;
  answered.add(key);
  try {
    const { prompt, button } = answer;
    if (prompt.action === 'agent_offer') {
      await client.setSpecialist(prompt.agent, true);
    } else if (prompt.action === 'todo_checkin') {
      await client.answerTodo(prompt.todoId, button === TODO_ACTIONS.done ? 'done' : 'not_yet', button === TODO_ACTIONS.notYet ? NOT_YET_FROM_NOTIFICATION_MINUTES : undefined);
    } else if (button === TODO_ACTIONS.add) {
      await client.acceptTodoOffer(prompt.reminderId);
    } else {
      await client.declineTodoOffer(prompt.reminderId);
    }
    console.info('[todo-prompt] answered', { kind: 'todo_prompt', action: prompt.action, button });
    return true;
  } catch (e) {
    // Not marked answered, so pressing it again, or opening the app, can still send it.
    answered.delete(key);
    console.warn('[todo-prompt] could not answer', { kind: 'todo_prompt', error: String(e) });
    return false;
  }
}

/** Handle a response if it is one of ours: answer, then take the question out of the shade. */
export async function handleTodoResponse(
  response: Pick<NotificationResponse, 'actionIdentifier'> & { notification?: { request?: { identifier?: string; content?: { data?: unknown } } } },
  client: TodoPromptClient,
  Notifications: Pick<NotificationsModule, 'dismissNotificationAsync'> | null,
): Promise<boolean> {
  // A headless task hands over whatever the platform gave it, so nothing here is assumed present.
  const request = response?.notification?.request;
  const answer = answerFrom(response?.actionIdentifier, request?.content?.data);
  const id = request?.identifier;
  if (!answer || !id) return false;
  const sent = await sendAnswer(id, answer, client);
  if (sent) await Notifications?.dismissNotificationAsync(id).catch(() => undefined);
  return true;
}
