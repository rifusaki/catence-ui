import { expandThinking } from '../../support/testUtils';

describe('Elements', () => {
  it('should be able to display inlined, side and page elements', () => {
    // Fork: assistant messages render first; the gen_img tool step renders
    // last, inside the collapsed 'Thinking...' accordion.
    cy.get('.step').eq(0).find('.inline-image').should('have.length', 1);

    cy.get('.step').eq(1).find('.inline-image').should('have.length', 1);
    cy.get('.step').eq(1).find('.element-link').should('have.length', 2);
    cy.get('.step').eq(1).find('.inline-pdf').should('have.length', 1);

    cy.get('.step').eq(2).find('.inline-image').should('have.length', 1);
    cy.get('.step').eq(2).find('.element-link').should('have.length', 2);
    cy.get('.step').eq(2).find('.inline-pdf').should('have.length', 1);

    // Element should not be inlined or referenced: the tool step is last.
    expandThinking();
    cy.get('.step').eq(3).find('.inline-image').should('have.length', 0);
    cy.get('.step').eq(3).find('.element-link').should('have.length', 0);
    cy.get('.step').eq(3).find('.inline-pdf').should('have.length', 0);

    // Side
    cy.get('.step')
      .eq(1)
      .find('.element-link')
      .eq(0)
      .should('contain', 'text1')
      .click();
    cy.get('#side-view-title').should('exist').and('contain', 'text1');

    cy.get('#side-view-content')
      .should('exist')
      .and('contain', 'Here is a side text document');

    // Page
    cy.get('.step')
      .eq(1)
      .find('.element-link')
      .eq(1)
      .should('contain', 'text2')
      .click();

    cy.get('#element-view')
      .should('exist')
      .and('contain', 'text2')
      .and('contain', 'Here is a page text document');
  });
});
