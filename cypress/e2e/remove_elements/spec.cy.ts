import { expandThinking } from '../../support/testUtils';

describe('remove_elements', () => {
  it('should be able to remove elements', () => {
    // Fork: the tool1 step renders inside a collapsed 'Thinking...' accordion.
    expandThinking();
    cy.get('#step-tool1').should('exist');
    cy.get('#step-tool1').click();
    cy.get('#step-tool1')
      .parent()
      .parent()
      .find('.inline-image')
      .should('have.length', 1);

    // Fork: the assistant message renders first; the tool step is last.
    cy.get('.step').should('have.length', 2);
    cy.get('.step').eq(0).find('.inline-image').should('have.length', 1);
  });
});
