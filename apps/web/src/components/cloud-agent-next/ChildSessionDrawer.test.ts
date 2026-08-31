import { describe, expect, it } from '@jest/globals';
import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ChildSessionHydrationState, KiloSessionId } from '@kilocode/cloud-agent-sdk';
import type { StoredMessage } from './types';

jest.mock('jotai', () => ({
  useAtomValue: (atom: unknown) => atom,
}));

jest.mock('./CloudAgentProvider', () => ({
  useManager: () => manager,
}));

jest.mock('./MessageBubble', () => ({
  MessageBubble: ({ message }: { message: StoredMessage }) =>
    React.createElement('div', null, message.info.id),
}));

jest.mock('./OlderMessagesHeader', () => ({
  OlderMessagesHeader: () => null,
}));

jest.mock('./older-messages-scroll', () => ({
  shouldAnnounceOlderMessagesArrival: () => false,
  useOlderMessagesPagination: () => ({
    requestOlderMessages: () => {},
    tryLoadOlderFromScroll: () => {},
  }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children?: ReactNode }) =>
    React.createElement('button', null, children),
}));

jest.mock('@/components/ui/sheet', () => {
  const block =
    (tag: string) =>
    ({ children }: { children?: ReactNode }) =>
      React.createElement(tag, null, children);

  return {
    Sheet: ({ children, open }: { children?: ReactNode; open: boolean }) =>
      open ? React.createElement(React.Fragment, null, children) : null,
    SheetContent: block('div'),
    SheetDescription: block('p'),
    SheetHeader: block('div'),
    SheetTitle: block('h2'),
  };
});

import { ChildSessionDrawer } from './ChildSessionDrawer';

Object.assign(globalThis, { React });

const SESSION_ID = 'ses_child_1' as KiloSessionId;

let childMessages: StoredMessage[] = [];
let hydrationState: ChildSessionHydrationState = { status: 'idle' };

const manager = {
  atoms: {
    childMessages: () => childMessages,
    childSessionHydrationState: () => hydrationState,
  },
  hydrateChildSession: jest.fn(),
  loadOlderChildMessages: jest.fn(),
};

function renderDrawer(): string {
  return renderToStaticMarkup(
    React.createElement(ChildSessionDrawer, {
      stack: [{ sessionId: SESSION_ID, description: 'Child task' }],
      onBack: jest.fn(),
      onOpenChange: jest.fn(),
      onOpenChildSession: jest.fn(),
    })
  );
}

const REFRESHING_STATE: ChildSessionHydrationState = {
  status: 'ready',
  cursor: null,
  hasOlder: false,
  isLoadingOlder: false,
  olderError: null,
  omittedItemCount: 0,
  isRefreshing: true,
};

describe('ChildSessionDrawer refresh indicator', () => {
  it('renders cached messages immediately while refreshing and suppresses the loading banner', () => {
    childMessages = [{ info: { id: 'child-message-1' } } as unknown as StoredMessage];
    hydrationState = REFRESHING_STATE;

    const html = renderDrawer();

    expect(html).toContain('child-message-1');
    expect(html).toContain('Refreshing…');
    expect(html).not.toContain('Loading sub-agent messages...');
    expect(html).not.toContain('Loading earlier sub-agent messages...');
  });

  it('shows the loading row when refreshing without cached messages', () => {
    childMessages = [];
    hydrationState = REFRESHING_STATE;

    const html = renderDrawer();

    expect(html).toContain('Loading sub-agent messages...');
    expect(html).not.toContain('No sub-agent messages yet.');
  });
});
