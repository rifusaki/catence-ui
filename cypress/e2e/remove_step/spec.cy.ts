import { expandThinking, submitMessage } from '../../support/testUtils';

describe('Remove Step', () => {
  it('should be able to remove a step', () => {
    cy.get('.step').should('have.length', 1);
    cy.get('.step').eq(0).should('contain', 'Message 1');

    // Fork: tool1 renders inside a collapsed 'Thinking...' accordion.
    expandThinking();
    cy.get('#step-tool1').should('exist');
    cy.get('#step-tool1').click();
    cy.get('.message-content').eq(1).should('contain', 'Child 1');

    cy.get('#step-tool1').should('not.exist');

    cy.get('.step').eq(1).should('contain', 'Message 2');
    cy.get('.step').should('have.length', 1);
    cy.get('.step').eq(0).should('contain', 'Message 2');
    cy.get('.step').should('have.length', 0);

    cy.get('.step').should('have.length', 1);
    cy.get('.step').eq(0).should('contain', 'Message 3');

    submitMessage('foo');

    // Fork: the ask reply is attached to the on_chat_start run and renders
    // inside its 'Thinking...' accordion; the ask itself is removed shortly
    // after, leaving the reply as the only step.
    expandThinking();
    cy.get('.step').should('have.length', 1);
    cy.get('.step').eq(0).should('contain', 'foo');
  });
});
