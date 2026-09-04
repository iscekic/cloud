import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReviewConfigLoading } from './ReviewConfigForm';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe('ReviewConfigLoading', () => {
  it('shows an accessible loading label while reserving form space', () => {
    const html = renderToStaticMarkup(React.createElement(ReviewConfigLoading));

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Loading Code Reviewer settings...');
    expect(html).toContain('motion-reduce:animate-none');
    expect(html).toContain('h-32');
  });
});
