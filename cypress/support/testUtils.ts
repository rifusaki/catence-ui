import { IWidgetConfig } from '../../libs/copilot/src/types';

const resizeObserverLoopErrRe = /^[^(ResizeObserver loop limit exceeded)]/;
Cypress.on('uncaught:exception', (err) => {
  /* returning false here prevents Cypress from failing the test */
  if (resizeObserverLoopErrRe.test(err.message)) {
    return false;
  }
});

export function submitMessage(message: string) {
  cy.get('#chat-input')
    .should('be.visible')
    .should('not.be.disabled')
    .type(message);
  cy.get('#chat-submit').should('not.be.disabled').click();
}

/**
 * Fork: trace steps render inside a collapsed 'Thinking...' accordion and
 * Radix unmounts accordion content while closed, so trace steps are absent
 * from the DOM until expanded. Waits for the first accordion and opens every
 * one currently mounted.
 */
export function expandThinking() {
  cy.get('button[aria-label^="Show "][aria-label*="thinking step"]')
    .should('have.length.greaterThan', 0)
    .each(($trigger) => {
      cy.wrap($trigger).click({ force: true });
    });
}

export function openHistory() {
  cy.get(`#chat-input`).should('not.be.disabled').type(`{upArrow}`);
}

export function closeHistory() {
  cy.get(`body`).click();
}

export function loadCopilotScript() {
  cy.step('Load the copilot script');

  cy.document().then((document) => {
    document.body.innerHTML = '<div id="root"></div>';

    return new Cypress.Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${document.location.origin}/copilot/index.js`;
      script.onload = resolve;
      script.onerror = () =>
        reject(new Error('Failed to load copilot/index.js'));
      document.body.appendChild(script);
    });
  });

  cy.window().should('have.property', 'mountChainlitWidget');
}

export function mountCopilotWidget(widgetConfig?: Partial<IWidgetConfig>) {
  cy.step('Mount the widget');
  cy.get('#chainlit-copilot').should('not.exist');
  cy.window().then((win) => {
    // @ts-expect-error is not a valid prop
    win.mountChainlitWidget({
      ...widgetConfig,
      chainlitServer: window.location.origin
    });
  });
  cy.get('#chainlit-copilot').should('exist');
}

export function colilotShouldBeClosed() {
  cy.get('#chainlit-copilot-button').should(
    'have.attr',
    'aria-expanded',
    'false'
  );
  cy.get('#chainlit-copilot-chat').should('not.exist');
}

export function copilotShouldBeOpen() {
  cy.get('#chainlit-copilot-button').should(
    'have.attr',
    'aria-expanded',
    'true'
  );
  cy.get('#chainlit-copilot-chat').should('exist');
}

export function openCopilot() {
  cy.step('Open copilot');

  colilotShouldBeClosed();

  cy.get('#chainlit-copilot-button').click();

  copilotShouldBeOpen();
}

export function getCopilotThreadId(
  assertion?: (threadId: string | null) => void
) {
  // @ts-expect-error getChainlitCopilotThreadId is not a standard Window prop
  const read = (window: Window) => window.getChainlitCopilotThreadId();
  return assertion
    ? cy.window().should((window) => assertion(read(window)))
    : cy.window().then(read);
}

export function clearCopilotThreadId(newThreadId?: string) {
  return cy.window().then((win) => {
    // @ts-expect-error is not a valid prop
    win.clearChainlitCopilotThreadId(newThreadId);
  });
}

const SOCKET_IO_EVENT_PREFIX = '42'; // Engine.IO MESSAGE (4) + Socket.IO EVENT (2)
const SOCKET_IO_PREFIX_LENGTH = 2;

export function setupWebSocketListener(
  eventType: string,
  callback: (data: any) => void
) {
  cy.on('window:before:load', (win) => {
    const OriginalWebSocket = win.WebSocket;

    cy.stub(win, 'WebSocket').callsFake(
      (url: string, protocols?: string | string[]) => {
        const ws = new OriginalWebSocket(url, protocols);

        ws.addEventListener('message', (event: MessageEvent) => {
          const data = event.data;
          if (
            typeof data === 'string' &&
            data.startsWith(SOCKET_IO_EVENT_PREFIX)
          ) {
            try {
              const payload = JSON.parse(data.slice(SOCKET_IO_PREFIX_LENGTH));
              if (payload[0] === eventType) {
                callback(payload[1]);
              }
            } catch (_e) {
              // Ignore parse errors
            }
          }
        });

        return ws;
      }
    );
  });
}
