/**
 * HTML Viewer Generator for Wiki
 *
 * Produces a self-contained index.html that embeds all markdown pages,
 * module tree, and metadata — viewable offline in any browser.
 */
/**
 * Generate the wiki HTML viewer (index.html) from existing markdown pages.
 */
export declare function generateHTMLViewer(wikiDir: string, projectName: string): Promise<string>;
