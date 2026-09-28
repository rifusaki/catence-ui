import { expandThinking, submitMessage } from '../../support/testUtils';

describe('Ask User', () => {
  it('should send a new message containing the user input', () => {
    cy.get('.step').should('have.length', 1);
    submitMessage('Jeeves');

    // Fork: assistant messages render first, and the answered user message is
    // attached to the on_chat_start run, so it lives inside that run's
    // collapsed 'Thinking...' accordion until expanded.
    expandThinking();
    cy.get('.step').should('have.length', 3);

    cy.get('.step').eq(2).should('contain', 'Jeeves');
  });
});
