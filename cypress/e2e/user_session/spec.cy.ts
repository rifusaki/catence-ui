import { submitMessage } from '../../support/testUtils';

function newSession() {
  // Fork: NewChat is one-click — it clears the session and navigates home
  // directly, with no #new-chat-dialog/#confirm.
  cy.get('#header')
    .get('#new-chat-button')
    .should('exist')
    .click({ force: true });

  // Clearing the session empties the message list immediately.
  cy.get('.step').should('have.length', 0);
}

describe('User Session', () => {
  it('should be able to store data related per user session', () => {
    submitMessage('Hello 1');

    cy.get('.step').should('have.length', 2);
    cy.get('.step').eq(1).should('contain', 'Prev message: None');

    submitMessage('Hello 2');

    cy.get('.step').should('have.length', 4);
    cy.get('.step').eq(3).should('contain', 'Prev message: Hello 1');

    newSession();

    submitMessage('Hello 3');

    cy.get('.step').should('have.length', 2);
    cy.get('.step').eq(1).should('contain', 'Prev message: None');

    submitMessage('Hello 4');

    cy.get('.step').should('have.length', 4);
    cy.get('.step').eq(3).should('contain', 'Prev message: Hello 3');
  });
});
