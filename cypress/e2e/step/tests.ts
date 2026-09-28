import { expandThinking, submitMessage } from '../../support/testUtils';

export function tests() {
  it('should be able to nest steps', () => {
    submitMessage('Hello');

    // Fork: tool1 (and its nested tool2/tool3) render inside a collapsed
    // 'Thinking...' accordion.
    expandThinking();

    cy.get('#step-tool1').should('exist').click();

    cy.get('#step-tool2').should('exist').click();

    cy.get('#step-tool3').should('exist');

    cy.get('.step').should('have.length', 5);
  });
}
